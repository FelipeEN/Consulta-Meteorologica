// Arquitetura: geocodificação resolve a cidade; previsão usa suas coordenadas.
  // Endpoints públicos: geocoding-api.open-meteo.com/v1/search e api.open-meteo.com/v1/forecast.
  const $ = id => document.getElementById(id);
  const state = { main:null, comparison:null, history:[], controllers:{main:null,comparison:null,refresh:null} };
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const fmt = (value, digits=0) => Number(value).toLocaleString('pt-BR',{maximumFractionDigits:digits,minimumFractionDigits:digits});
  const degrees = value => `${fmt(value,1)} °C`;
  const placeName = city => [city.name,city.admin1,city.country].filter(Boolean).join(' · ');

  // Mapeamento dos códigos meteorológicos WMO para descrição e emoji acessível.
  const wmo = {
    0:['Céu limpo','☀️'],1:['Predominantemente limpo','🌤️'],2:['Parcialmente nublado','⛅'],3:['Nublado','☁️'],
    45:['Neblina','🌫️'],48:['Neblina com geada','🌫️'],51:['Garoa leve','🌦️'],53:['Garoa','🌦️'],
    55:['Garoa forte','🌧️'],56:['Garoa congelante','🌧️'],57:['Garoa congelante','🌧️'],
    61:['Chuva leve','🌦️'],63:['Chuva','🌧️'],65:['Chuva forte','🌧️'],66:['Chuva congelante','🌧️'],
    67:['Chuva congelante','🌧️'],71:['Neve leve','🌨️'],73:['Neve','🌨️'],75:['Neve forte','❄️'],
    77:['Grãos de neve','🌨️'],80:['Pancadas de chuva','🌦️'],81:['Pancadas de chuva','🌧️'],
    82:['Pancadas fortes de chuva','⛈️'],85:['Pancadas de neve','🌨️'],86:['Pancadas fortes de neve','❄️'],
    95:['Trovoadas','⛈️'],96:['Trovoadas com granizo','⛈️'],99:['Trovoadas com granizo','⛈️']
  };
  const conditionFor = code => wmo[code] || ['Condição não classificada','🌤️'];
  const compass = angle => ['N','NE','L','SE','S','SO','O','NO'][Math.round(((angle % 360)+360)%360 / 45)%8];
  function dayLabel(iso){
    const [y,m,d]=iso.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d)));
  }
  function status(id,message,kind=''){
    const el=$(id); el.textContent=message; el.className=`${id==='refresh-status'?'text-sm':'mt-3 min-h-6 text-sm'} ${kind==='error'?'status-error':kind==='success'?'status-success':''}`;
  }
  function failure(error){
    // Erros de rede, HTTP e respostas inválidas são diferenciados sem renderizar dados parciais.
    if(error instanceof TypeError) return 'Falha de rede. Verifique a conexão e tente novamente.';
    return error.message || 'Não foi possível concluir a consulta. Tente novamente.';
  }
  async function jsonFrom(url,signal,service){
    const response=await fetch(url,{signal});
    if(!response.ok) throw new Error(`${service} indisponível (HTTP ${response.status}). Tente novamente.`);
    try { return await response.json(); }
    catch { throw new Error(`Resposta inválida do serviço de ${service.toLowerCase()}.`); }
  }
  async function findCity(query,signal){
    const url=`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({name:query,count:'10',language:'pt',format:'json'})}`;
    const data=await jsonFrom(url,signal,'Geocodificação');
    if(!data || typeof data!=='object' || (data.results!==undefined && !Array.isArray(data.results))) throw new Error('Resposta inválida da geocodificação.');
    if(!data.results?.length) throw new Error('Cidade não encontrada. Confira a grafia e tente novamente.');
    const city=data.results.find(c=>c && typeof c.name==='string' && number(c.latitude) && number(c.longitude) && typeof c.country==='string');
    if(!city) throw new Error('Resposta inválida da geocodificação.');
    return city;
  }
  async function forecast(city,signal){
    const params=new URLSearchParams({
      latitude:String(city.latitude),longitude:String(city.longitude),
      current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
      hourly:'uv_index',
      daily:'weather_code,temperature_2m_max,temperature_2m_min',
      timezone:'auto',forecast_days:'5'
    });
    const data=await jsonFrom(`https://api.open-meteo.com/v1/forecast?${params}`,signal,'Previsão meteorológica');
    const c=data?.current,d=data?.daily,h=data?.hourly;
    if(typeof data?.timezone!=='string' || !data.timezone ||
      typeof c?.time!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(c.time) ||
      !['temperature_2m','apparent_temperature','relative_humidity_2m','precipitation','wind_speed_10m','wind_direction_10m','weather_code'].every(k=>number(c[k])) ||
      !d || !['time','weather_code','temperature_2m_max','temperature_2m_min'].every(k=>Array.isArray(d[k]) && d[k].length>=5) ||
      !d.time.slice(0,5).every((t,i)=>/^\d{4}-\d{2}-\d{2}$/.test(t) && number(d.weather_code[i]) && number(d.temperature_2m_max[i]) && number(d.temperature_2m_min[i])) ||
      !h || !Array.isArray(h.time) || !Array.isArray(h.uv_index) || h.time.length!==h.uv_index.length || !h.time.length)
      throw new Error('Resposta inválida ou incompleta da previsão meteorológica.');
    return data;
  }
  function nearestUV(data){
    const target=Date.parse(`${data.current.time}:00Z`);
    let best=null, distance=Infinity;
    data.hourly.time.forEach((time,i)=>{
      const uv=data.hourly.uv_index[i], parsed=Date.parse(`${time}:00Z`);
      if(number(uv) && Number.isFinite(parsed) && Math.abs(parsed-target)<distance){
        best={value:uv,time}; distance=Math.abs(parsed-target);
      }
    });
    return best;
  }
  function addHistory(city){
    const key=c=>`${c.name.toLocaleLowerCase('pt-BR')}|${c.admin1||''}|${c.country}|${c.latitude}|${c.longitude}`;
    if(key(state.history[0]||{})!==key(city)) state.history=[city,...state.history.filter(c=>key(c)!==key(city))].slice(0,5);
    renderHistory();
  }
  function renderHistory(){
    const list=$('history-list'); list.replaceChildren();
    state.history.forEach(city=>{
      const button=document.createElement('button');
      button.type='button'; button.className='rounded-full border border-[#cadbd0] bg-white px-4 py-2 text-sm font-semibold';
      button.textContent=placeName(city);
      button.setAttribute('aria-label',`Consultar novamente ${placeName(city)}`);
      button.addEventListener('click',()=>loadMain(city));
      list.append(button);
    });
  }
  function dailyCard(date,max,min,code){
    const card=document.createElement('article'); card.className='dynamic-card';
    const dateEl=document.createElement('h3'); dateEl.className='font-bold capitalize'; dateEl.textContent=dayLabel(date);
    const [description,icon]=conditionFor(code);
    const symbol=document.createElement('span'); symbol.className='block text-3xl my-2'; symbol.textContent=icon;
    symbol.setAttribute('role','img'); symbol.setAttribute('aria-label',description);
    const text=document.createElement('p'); text.className='font-semibold'; text.textContent=`Máx. ${degrees(max)} · Mín. ${degrees(min)}`;
    const detail=document.createElement('p'); detail.className='text-sm text-[#58746e] mt-1'; detail.textContent=description;
    card.append(dateEl,symbol,text,detail); return card;
  }
  function renderChart(data){
    const d=data.daily, max=d.temperature_2m_max.slice(0,5),min=d.temperature_2m_min.slice(0,5);
    const low=Math.floor(Math.min(...min,...max)-2),high=Math.ceil(Math.max(...min,...max)+2),range=Math.max(1,high-low);
    const x=i=>65+i*125, y=v=>205-(v-low)/range*145;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 640 270');svg.setAttribute('class','w-full h-auto');
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label',`Temperaturas máximas e mínimas dos cinco dias: ${d.time.slice(0,5).map((date,i)=>`${dayLabel(date)}, máxima ${degrees(max[i])}, mínima ${degrees(min[i])}`).join('; ')}`);
    function node(tag,attrs,text){
      const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
      Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));
      if(text!==undefined)el.textContent=text;
      svg.append(el);return el;
    }
    for(let i=0;i<4;i++){
      const value=low+(high-low)*i/3, yy=y(value);
      node('line',{x1:52,x2:590,y1:yy,y2:yy,stroke:'#dce5db','stroke-dasharray':'4 5'});
      node('text',{x:4,y:yy+4,fill:'#58746e','font-size':12},`${fmt(value)}°`);
    }
    [[max,'#287766'],[min,'#3978a0']].forEach(([series,color])=>{
      node('polyline',{points:series.map((v,i)=>`${x(i)},${y(v)}`).join(' '),fill:'none',stroke:color,'stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'});
      series.forEach((v,i)=>{
        node('circle',{cx:x(i),cy:y(v),r:5,fill:color});
        node('text',{x:x(i),y:y(v)+(series===max?-13:20),'text-anchor':'middle',fill:'#103833','font-size':13,'font-weight':'700'},`${fmt(v,1)}°`);
      });
    });
    d.time.slice(0,5).forEach((date,i)=>node('text',{x:x(i),y:249,'text-anchor':'middle',fill:'#58746e','font-size':13},dayLabel(date)));
    $('chart').replaceChildren(svg);
  }
  function renderMain(){
    const {city,data}=state.main,c=data.current,uv=nearestUV(data),[description,icon]=conditionFor(c.weather_code);
    $('location').textContent=placeName(city);
    $('coordinates').textContent=`Latitude ${fmt(city.latitude,4)}° · Longitude ${fmt(city.longitude,4)}°`;
    $('local-time').textContent=`Observação: ${c.time.slice(8,10)}/${c.time.slice(5,7)}/${c.time.slice(0,4)} às ${c.time.slice(11,16)} · Fuso: ${data.timezone}${number(data.utc_offset_seconds)?` (UTC ${data.utc_offset_seconds>=0?'+':'−'}${fmt(Math.abs(data.utc_offset_seconds)/3600,1)})`:''}`;
    $('weather-icon').textContent=icon;$('weather-icon').setAttribute('aria-label',description);
    $('temperature').textContent=degrees(c.temperature_2m);
    $('condition').textContent=`${description} · código WMO ${c.weather_code}`;
    $('feels-value').textContent=degrees(c.apparent_temperature);
    $('humidity-value').textContent=`${fmt(c.relative_humidity_2m)}%`;
    $('wind-value').textContent=`${fmt(c.wind_speed_10m,1)} km/h`;
    $('direction-value').textContent=`${fmt(c.wind_direction_10m)}° (${compass(c.wind_direction_10m)})`;
    $('uv-value').textContent=uv?`${fmt(uv.value,1)} · ${uv.time.slice(11,16)}`:'Indisponível';
    $('rain-value').textContent=`${fmt(c.precipitation,1)} mm`;
    const list=$('daily-list');list.replaceChildren();
    data.daily.time.slice(0,5).forEach((date,i)=>list.append(dailyCard(date,data.daily.temperature_2m_max[i],data.daily.temperature_2m_min[i],data.daily.weather_code[i])));
    renderChart(data);$('results').classList.remove('hidden');
    renderComparison();
  }
  function renderComparison(){
    if(!state.main || !state.comparison){$('comparison-section').classList.add('hidden');return}
    const a=state.main,b=state.comparison;
    $('comparison-context').textContent=`${placeName(a.city)} × ${placeName(b.city)} · cada previsão segue o fuso local da respectiva cidade.`;
    const list=$('comparison-list');list.replaceChildren();
    for(let i=0;i<5;i++){
      const card=document.createElement('article');card.className='dynamic-card';
      const title=document.createElement('h3');title.className='font-bold mb-3';title.textContent=`Dia ${i+1}`;
      card.append(title);
      [a,b].forEach(item=>{
        const row=document.createElement('div');row.className='border-t border-[#dce5db] py-3 text-sm';
        const [description,icon]=conditionFor(item.data.daily.weather_code[i]);
        const name=document.createElement('p');name.className='font-bold';name.textContent=placeName(item.city);
        const info=document.createElement('p');info.textContent=`${dayLabel(item.data.daily.time[i])} · Máx. ${degrees(item.data.daily.temperature_2m_max[i])} · Mín. ${degrees(item.data.daily.temperature_2m_min[i])}`;
        const conditions=document.createElement('p');conditions.className='text-[#58746e]';conditions.textContent=`${icon} ${description}`;
        row.append(name,info,conditions);card.append(row);
      });list.append(card);
    }
    $('comparison-section').classList.remove('hidden');
  }
  async function run(slot,queryOrCity){
    const statusId=slot==='main'?'main-status':'compare-status';
    const button=$(slot==='main'?'search-button':'compare-button');
    if(typeof queryOrCity==='string' && !queryOrCity.trim()){
      status(statusId,'Digite o nome de uma cidade para pesquisar.','error');
      $(slot==='main'?'city-input':'compare-input').focus();return;
    }
    state.controllers[slot]?.abort();
    const controller=new AbortController();state.controllers[slot]=controller;
    button.disabled=true;status(statusId,'Consultando cidade e previsão…');
    try{
      const city=typeof queryOrCity==='string'?await findCity(queryOrCity.trim(),controller.signal):queryOrCity;
      const data=await forecast(city,controller.signal);
      if(state.controllers[slot]!==controller)return;
      state[slot]={city,data};
      if(slot==='main'){renderMain();addHistory(city)}
      else renderComparison();
      status(statusId,`Dados atualizados: ${placeName(city)}.`,'success');
    }catch(error){
      if(error.name!=='AbortError' && state.controllers[slot]===controller)status(statusId,failure(error),'error');
    }finally{
      if(state.controllers[slot]===controller){state.controllers[slot]=null;button.disabled=false}
    }
  }
  $('weather-form').addEventListener('submit',event=>{event.preventDefault();run('main',$('city-input').value)});
  $('compare-form').addEventListener('submit',event=>{event.preventDefault();run('comparison',$('compare-input').value)});
  $('refresh-button').addEventListener('click',async event=>{
    const button=event.currentTarget;
    if(!state.main)return;
    state.controllers.refresh?.abort();
    const controller=new AbortController();state.controllers.refresh=controller;
    button.disabled=true;status('refresh-status','Atualizando previsão…');
    try{
      const city=state.main.city,data=await forecast(city,controller.signal);
      if(state.controllers.refresh!==controller || state.main.city!==city)return;
      state.main={city,data};renderMain();
      status('refresh-status','Previsão atualizada.','success');
    }catch(error){
      if(error.name!=='AbortError' && state.controllers.refresh===controller)status('refresh-status',failure(error),'error');
    }finally{
      if(state.controllers.refresh===controller){state.controllers.refresh=null;button.disabled=false}
    }
  });
  lucide.createIcons();
  run('main','Salvador');
