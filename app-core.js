const CITY_OPTIONS={"Riyadh":"الرياض","Jeddah":"جدة","Dammam":"الدمام","Mecca":"مكة المكرمة","Medina":"المدينة المنورة","Abha":"أبها","Khamis Mushait":"خميس مشيط","Buraydah":"بريدة","Al-Sulayyil":"السليل","Al-Mithnab":"المذنب","Hail":"حائل","Najran":"نجران","Jizan":"جازان","Taif":"الطائف","Sakakah":"سكاكا","Arar":"عرعر"};
const PRAYERS=[['Fajr','الفجر'],['Sunrise','الشروق'],['Dhuhr','الظهر'],['Asr','العصر'],['Maghrib','المغرب'],['Isha','العشاء']];
const IQ_DEFAULT={Fajr:25,Dhuhr:20,Asr:20,Maghrib:10,Isha:20}; const APPOINTMENTS_KEY='athkarAppointmentsV1';
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
let USER_SETTINGS_CACHE={city:"Al-Mithnab",iqamah:{...IQ_DEFAULT}};
let USER_SETTINGS_READY=false;
let USER_SETTINGS_PROMISE=null;

function selectedCity(){
  return CITY_OPTIONS[USER_SETTINGS_CACHE.city]?USER_SETTINGS_CACHE.city:"Al-Mithnab";
}
function iqamah(){
  return {...IQ_DEFAULT,...(USER_SETTINGS_CACHE.iqamah||{})};
}
async function pushPrayerSettings(){
  if(!window.AthkarAuth?.token?.())return;
  const payload={city:selectedCity(),iqamah:iqamah()};
  const r=await AthkarAuth.fetch('/api/settings',{method:'POST',body:JSON.stringify(payload)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok)throw new Error(j.error||'تعذر حفظ إعدادات الصلاة');
  USER_SETTINGS_CACHE={
    city:j.settings?.city||payload.city,
    iqamah:{...IQ_DEFAULT,...(j.settings?.iqamah||payload.iqamah)}
  };
  USER_SETTINGS_READY=true;
  return USER_SETTINGS_CACHE;
}
async function syncPrayerSettings(){
  if(USER_SETTINGS_READY)return USER_SETTINGS_CACHE;
  if(USER_SETTINGS_PROMISE)return USER_SETTINGS_PROMISE;
  USER_SETTINGS_PROMISE=(async()=>{
    if(window.__authReady)await window.__authReady;
    if(!window.AthkarAuth?.token?.())return USER_SETTINGS_CACHE;
    const r=await AthkarAuth.fetch('/api/settings');
    if(!r.ok)throw new Error('تعذر تحميل إعدادات المستخدم');
    const j=await r.json();
    if(j.exists&&j.settings){
      USER_SETTINGS_CACHE={
        city:CITY_OPTIONS[j.settings.city]?j.settings.city:"Al-Mithnab",
        iqamah:{...IQ_DEFAULT,...(j.settings.iqamah||{})}
      };
      USER_SETTINGS_READY=true;
      return USER_SETTINGS_CACHE;
    }
    USER_SETTINGS_CACHE={city:"Al-Mithnab",iqamah:{...IQ_DEFAULT}};
    return await pushPrayerSettings();
  })();
  try{return await USER_SETTINGS_PROMISE}
  finally{USER_SETTINGS_PROMISE=null}
}
async function fillCitySelect(el){
  if(!el)return;
  await syncPrayerSettings();
  el.innerHTML=Object.entries(CITY_OPTIONS).map(([v,n])=>`<option value="${v}">${n}</option>`).join('');
  el.value=selectedCity();
  el.onchange=async()=>{
    const previous=USER_SETTINGS_CACHE.city;
    USER_SETTINGS_CACHE.city=CITY_OPTIONS[el.value]?el.value:"Al-Mithnab";
    try{await pushPrayerSettings();location.reload()}
    catch(e){USER_SETTINGS_CACHE.city=previous;el.value=previous;console.warn(e)}
  };
}
async function saveIq(v){
  USER_SETTINGS_CACHE.iqamah={...IQ_DEFAULT,...v};
  return pushPrayerSettings();
}

// تحميل بيانات الحساب بعد نجاح المصادقة فقط.
window.addEventListener('DOMContentLoaded',()=>{
  window.__authReady?.then(async()=>{
    await Promise.all([syncPrayerSettings(),syncUserCalendarData()]);
    document.dispatchEvent(new CustomEvent('athkar-user-data-ready'));
  }).catch(()=>{});
});
function saNow(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Riyadh'}))}
function ymd(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function hijriParts(d){const f=new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura',{timeZone:'Asia/Riyadh',day:'numeric',month:'numeric',year:'numeric'});const p={};for(const x of f.formatToParts(d))if(x.type!=='literal')p[x.type]=+x.value;return {day:p.day,month:p.month,year:p.year}}
function hijriLong(d){return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{timeZone:'Asia/Riyadh',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d)}
function gregLong(d){return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{timeZone:'Asia/Riyadh',day:'numeric',month:'long',year:'numeric'}).format(d)}
function gregMonthYear(d){return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{timeZone:'Asia/Riyadh',month:'long',year:'numeric'}).format(d)}
function hijriMonthYear(d){return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{timeZone:'Asia/Riyadh',month:'long',year:'numeric'}).format(d)}
function formatTime24to12(t){if(!t||!/^\d{1,2}:\d{2}/.test(t))return '--';const [h,m]=t.split(':').map(Number),hh=h%12||12;return `${hh}:${String(m).padStart(2,'0')} ${h<12?'ص':'م'}`}
async function fetchPrayer(city=selectedCity()){if(!navigator.onLine)throw new Error('offline');const url=`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=Saudi%20Arabia&method=4`;const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('api');const j=await r.json();if(!j?.data?.timings)throw new Error('data');return j.data.timings}
function timeOnDate(t,d=saNow()){const [h,m]=String(t).split(':').map(Number);return new Date(d.getFullYear(),d.getMonth(),d.getDate(),h,m,0,0)}
function prayerState(times,now=saNow()){const iq=iqamah();const seq=['Fajr','Dhuhr','Asr','Maghrib','Isha'];for(const k of seq){const ad=timeOnDate(times[k],now),end=new Date(ad.getTime()+(iq[k]||0)*60000);if(now<ad)return {mode:'before',key:k,name:Object.fromEntries(PRAYERS)[k],at:ad,target:ad,iq:iq[k]};if(now>=ad&&now<end)return {mode:'iqamah',key:k,name:Object.fromEntries(PRAYERS)[k],at:ad,target:end,iq:iq[k]}}
 const tomorrow=new Date(now);tomorrow.setDate(now.getDate()+1);const at=timeOnDate(times.Fajr,tomorrow);return {mode:'before',key:'Fajr',name:'الفجر',at,target:at,iq:iq.Fajr}}
function durationParts(target,now=saNow()){let ms=Math.max(0,target-now),s=Math.floor(ms/1000);const days=Math.floor(s/86400);s%=86400;const h=Math.floor(s/3600);s%=3600;const m=Math.floor(s/60),sec=s%60;return {days,h,m,sec}}
function durationText(target,withSeconds=true){const x=durationParts(target);if(x.days>0)return `${x.days} يوم ${String(x.h).padStart(2,'0')}:${String(x.m).padStart(2,'0')}:${String(x.sec).padStart(2,'0')}`;return `${String(x.h).padStart(2,'0')}:${String(x.m).padStart(2,'0')}:${String(x.sec).padStart(2,'0')}`}
let APPOINTMENTS_CACHE=[];
let FINANCE_OVERRIDES_CACHE={};
let CLOUD_DATA_READY=false;
function loadAppointments(){return APPOINTMENTS_CACHE}
function saveAppointments(a){APPOINTMENTS_CACHE=Array.isArray(a)?a:[]}
async function cloudUpsertAppointment(a){
  const r=await AthkarAuth.fetch('/api/appointments',{method:'POST',body:JSON.stringify(a)});
  const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'تعذر حفظ الموعد');return j.appointment;
}
async function cloudDeleteAppointment(id){
  const r=await AthkarAuth.fetch('/api/appointments/'+encodeURIComponent(id),{method:'DELETE'});
  const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'تعذر حذف الموعد');
}
async function syncUserCalendarData(){
  if(!window.AthkarAuth?.token?.())return;
  const [ar,fr]=await Promise.all([AthkarAuth.fetch('/api/appointments'),AthkarAuth.fetch('/api/finance-overrides')]);
  if(ar.status===401||fr.status===401)return;
  const aj=await ar.json(),fj=await fr.json();
  APPOINTMENTS_CACHE=(aj.ok&&Array.isArray(aj.appointments)?aj.appointments:[]).map(a=>({...a,repeat:'none'}));
  FINANCE_OVERRIDES_CACHE={};
  if(fj.ok&&Array.isArray(fj.overrides))for(const x of fj.overrides)FINANCE_OVERRIDES_CACHE[financeSourceKey(x.finance_type,+x.year,+x.month)]=x.custom_date;
  CLOUD_DATA_READY=true;
  document.dispatchEvent(new CustomEvent('athkar-calendar-data-ready'));
}
function appointmentBase(a){const [y,m,d]=a.date.split('-').map(Number),[h,mi]=(a.time||'00:00').split(':').map(Number);return new Date(y,m-1,d,h,mi)}
function occursOn(a,date){const base=appointmentBase(a),cur=new Date(date.getFullYear(),date.getMonth(),date.getDate(),base.getHours(),base.getMinutes());if(a.repeat==='none'||!a.repeat)return ymd(cur)===a.date;if(cur<base)return false;const diff=Math.round((new Date(cur.getFullYear(),cur.getMonth(),cur.getDate())-new Date(base.getFullYear(),base.getMonth(),base.getDate()))/86400000);if(a.repeat==='daily')return true;if(a.repeat==='weekly')return diff%7===0;if(a.repeat==='monthly')return cur.getDate()===base.getDate();if(a.repeat==='yearly')return cur.getDate()===base.getDate()&&cur.getMonth()===base.getMonth();return false}
function nextOccurrence(a,from=saNow()){const b=appointmentBase(a);if((!a.repeat||a.repeat==='none'))return b;for(let i=0;i<370;i++){const d=new Date(from.getFullYear(),from.getMonth(),from.getDate()+i,b.getHours(),b.getMinutes());if(occursOn(a,d)&&d>=from)return d}return b}
function upcomingAppointments(days=7){const now=saNow(),end=new Date(now.getTime()+days*86400000);return loadAppointments().map(a=>({...a,_next:nextOccurrence(a,now)})).filter(a=>a._next>=now&&a._next<=end).sort((a,b)=>a._next-b._next)}
const OFFICIAL_SALARY_2026=['2026-01-27','2026-02-26','2026-03-26','2026-04-27','2026-05-24','2026-06-28','2026-07-27','2026-08-27','2026-09-27','2026-10-27','2026-11-26','2026-12-27'];
const FINANCE_OVERRIDES_KEY='athkarFinanceOverridesV1';
function parseYmd(x){const [y,m,d]=x.split('-').map(Number);return new Date(y,m-1,d,12)}
function salaryRule(y,m){let d=new Date(y,m-1,27,12);if(d.getDay()===5)d.setDate(26);else if(d.getDay()===6)d.setDate(28);return d}
function citizenRule(y,m){let d=new Date(y,m-1,10,12);if(d.getDay()===5)d.setDate(9);else if(d.getDay()===6)d.setDate(11);return d}
function financeSourceKey(kind,y,m){return `${kind}:${y}-${String(m).padStart(2,'0')}`}
function loadFinanceOverrides(){return FINANCE_OVERRIDES_CACHE}
function saveFinanceOverrides(v){FINANCE_OVERRIDES_CACHE=v||{}}
function officialFinanceDate(kind,y,m){if(kind==='salary')return y===2026?parseYmd(OFFICIAL_SALARY_2026[m-1]):salaryRule(y,m);return citizenRule(y,m)}
function financeDateForSource(kind,y,m){const key=financeSourceKey(kind,y,m),o=loadFinanceOverrides()[key];return o?parseYmd(o):officialFinanceDate(kind,y,m)}
function setFinanceOverride(kind,y,m,date){const o=loadFinanceOverrides(),key=financeSourceKey(kind,y,m);o[key]=ymd(date);saveFinanceOverrides(o);AthkarAuth.fetch('/api/finance-overrides',{method:'POST',body:JSON.stringify({finance_type:kind,year:y,month:m,custom_date:ymd(date)})}).catch(console.warn);return financeDateForSource(kind,y,m)}
function clearFinanceOverride(kind,y,m){const o=loadFinanceOverrides(),key=financeSourceKey(kind,y,m);delete o[key];saveFinanceOverrides(o);AthkarAuth.fetch(`/api/finance-overrides?type=${encodeURIComponent(kind)}&year=${y}&month=${m}`,{method:'DELETE'}).catch(console.warn);return financeDateForSource(kind,y,m)}
function financeEvent(kind,y,m){const date=financeDateForSource(kind,y,m),key=financeSourceKey(kind,y,m);return {kind,emoji:kind==='salary'?'💰':'🇸🇦',title:kind==='salary'?'الراتب الحكومي':'حساب المواطن',date,sourceYear:y,sourceMonth:m,sourceKey:key,overridden:!!loadFinanceOverrides()[key],officialDate:officialFinanceDate(kind,y,m)}}
function financeCandidatesAround(y,m){const out=[];for(let delta=-2;delta<=2;delta++){const d=new Date(y,m-1+delta,1),sy=d.getFullYear(),sm=d.getMonth()+1;out.push(financeEvent('salary',sy,sm),financeEvent('citizen',sy,sm))}return out}
function financeForMonth(y,m){return financeCandidatesAround(y,m).filter(x=>x.date.getFullYear()===y&&x.date.getMonth()+1===m).sort((a,b)=>a.date-b.date)}
function nextFinance(kind,now=saNow()){const out=[];for(let i=-1;i<16;i++){const d=new Date(now.getFullYear(),now.getMonth()+i,1),y=d.getFullYear(),m=d.getMonth()+1;out.push(financeEvent(kind,y,m))}const floor=new Date(now.getFullYear(),now.getMonth(),now.getDate());return out.filter(x=>x.date>=floor).sort((a,b)=>a.date-b.date)[0]?.date}
function nextSalary(now=saNow()){return nextFinance('salary',now)}
function citizenDate(y,m){return financeDateForSource('citizen',y,m)}
function nextCitizen(now=saNow()){return nextFinance('citizen',now)}

function durationUnits(target,now=saNow()){const x=durationParts(target,now);return [{n:x.days,u:'يوم'},{n:x.h,u:'ساعة'},{n:x.m,u:'دقيقة'},{n:x.sec,u:'ثانية'}]}
function isExpired(target,now=saNow()){return target.getTime()<now.getTime()}
function durationInlineHTML(target){if(isExpired(target))return '<span class="expired-label">● انتهى</span>';return `<span class="countdown-line">${durationUnits(target).map(x=>`<span class="cd-unit"><b>${x.n}</b><small>${x.u}</small></span>`).join('')}</span>`}

function nav(active){
 const icons={
  home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5v8.2A2.3 2.3 0 0 1 17.7 21H6.3A2.3 2.3 0 0 1 4 18.7Z"/><path d="M9.2 21v-6h5.6v6"/></svg>',
  prayer:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 5.49a1.764 1.764 0 0 1 -2.5 -2.49"/><path d="M12 6v3"/><path d="M19 21a8.9 8.9 0 0 0 1 -3.67c0 -2 -.92 -3.25 -3.24 -4.51a17.4 17.4 0 0 1 -4.76 -3.82a17.4 17.4 0 0 1 -4.76 3.82c-2.32 1.26 -3.24 2.55 -3.24 4.51a8.9 8.9 0 0 0 1 3.67h14"/></svg>',
  calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M7.5 2.8v4.4M16.5 2.8v4.4M3.8 9h16.4"/><path d="M8 13h2M14 13h2M8 17h2M14 17h2"/></svg>',
  athkar:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 15.5A8 8 0 1 1 8.5 5.1a6.9 6.9 0 0 0 10.4 10.4Z"/><path d="m18.4 5 .5 1.2 1.3.5-1.3.5-.5 1.2-.5-1.2-1.3-.5 1.3-.5z"/></svg>',
  tas:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.8 5.2c2.8 2.8 2.8 7.4 0 10.2s-7.4 2.8-10.2 0-2.8-7.4 0-10.2"/><circle cx="6.8" cy="4.4" r="1.35"/><circle cx="10" cy="2.9" r="1.35"/><circle cx="13.4" cy="2.9" r="1.35"/><circle cx="16.6" cy="4.4" r="1.35"/><path d="M17.8 15.4 20 18l-1.6 3.2"/><circle cx="20" cy="18" r=".8"/></svg>'
 };
 const item=(key,href,label)=>`<a class="${active===key?'active':''}" href="${href}"><span class="nav-icon">${icons[key]}</span>${label}</a>`;
 return `<nav class="bottom-nav">${item('home','time.html','الرئيسية')}${item('prayer','prayer.html','الصلاة')}${item('calendar','calendar.html','التقويم')}${item('athkar','index.html','الأذكار')}${item('tas','tas.html','التسبيح')}</nav>`
}
// Safari: منع Double‑Tap Zoom يكون عبر touch-action على عناصر التحكم فقط.
 // لا نمنع touchend على مستوى الصفحة حتى لا تعلق الصفحة في Zoom.
