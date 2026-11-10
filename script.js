// Elementos da página
const form = document.getElementById("weather-form");
const input = document.getElementById("city-input");
const status = document.getElementById("status");
const button = document.getElementById("search-button");
const results = document.getElementById("results");

let activeController = null;

// Descrição e ícone para cada código meteorológico da Open-Meteo
const weatherTypes = {
  0: ["Céu limpo", "☀️"],
  1: ["Predominantemente limpo", "🌤️"],
  2: ["Parcialmente nublado", "⛅"],
  3: ["Nublado", "☁️"],
  45: ["Neblina", "🌫️"],
  48: ["Neblina com geada", "🌫️"],
  51: ["Garoa leve", "🌦️"],
  53: ["Garoa", "🌦️"],
  55: ["Garoa forte", "🌧️"],
  56: ["Garoa congelante", "🌧️"],
  57: ["Garoa congelante", "🌧️"],
  61: ["Chuva leve", "🌦️"],
  63: ["Chuva", "🌧️"],
  65: ["Chuva forte", "🌧️"],
  66: ["Chuva congelante", "🌧️"],
  67: ["Chuva congelante", "🌧️"],
  71: ["Neve leve", "🌨️"],
  73: ["Neve", "🌨️"],
  75: ["Neve forte", "❄️"],
  77: ["Grãos de neve", "🌨️"],
  80: ["Pancadas de chuva", "🌦️"],
  81: ["Pancadas de chuva", "🌧️"],
  82: ["Pancadas fortes", "⛈️"],
  85: ["Pancadas de neve", "🌨️"],
  86: ["Pancadas de neve", "❄️"],
  95: ["Trovoadas", "⛈️"],
  96: ["Trovoadas com granizo", "⛈️"],
  99: ["Trovoadas com granizo", "⛈️"]
};

// Funções auxiliares
function typeFor(code) {
  return weatherTypes[code] || ["Condições variáveis", "🌤️"];
}

function degree(value) {
  return `${Math.round(value)}°`;
}

function localHour(iso) {
  return iso.slice(11, 16);
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

// Monta os cartões com a previsão das próximas seis horas
function showForecast(hourly, now) {
  const list = document.getElementById("hourly-list");
  list.replaceChildren();

  const currentHour = now.slice(0, 13);
  let start = hourly.time.findIndex(time => time.slice(0, 13) >= currentHour);

  if (start < 0) {
    start = 0;
  }

  hourly.time.slice(start, start + 6).forEach((time, offset) => {
    const index = start + offset;
    const [description, icon] = typeFor(hourly.weather_code[index]);

    const card = document.createElement("article");
    card.className = "hour-card rounded-2xl p-4 sm:p-5";

    const hour = document.createElement("p");
    hour.className = "text-sm text-[#58746e] font-semibold";
    hour.textContent = localHour(time);

    const symbol = document.createElement("p");
    symbol.className = "text-3xl my-3";
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = icon;

    const temperature = document.createElement("p");
    temperature.className = "text-2xl font-bold";
    temperature.textContent = degree(hourly.temperature_2m[index]);

    const condition = document.createElement("p");
    condition.className = "text-xs text-[#58746e] mt-1";
    condition.textContent = description;

    card.append(hour, symbol, temperature, condition);
    list.append(card);
  });
}

// Consulta a localização da cidade e, em seguida, os dados meteorológicos
async function searchWeather(cityName, signal) {
  const geocodingUrl =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=pt&format=json`;

  const geoResponse = await fetch(geocodingUrl, { signal });

  if (!geoResponse.ok) {
    throw new Error("Não foi possível localizar a cidade. Tente novamente.");
  }

  const geo = await geoResponse.json();
  const city = geo.results?.[0];

  if (!city) {
    throw new Error("Cidade não encontrada. Confira a grafia e tente novamente.");
  }

  const params = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    hourly: "temperature_2m,weather_code",
    forecast_days: "2",
    timezone: "auto"
  });

  const weatherResponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params}`,
    { signal }
  );

  if (!weatherResponse.ok) {
    throw new Error("Não foi possível obter a previsão. Tente novamente.");
  }

  const data = await weatherResponse.json();

  if (!data.current || !data.hourly?.time?.length) {
    throw new Error("Os dados meteorológicos estão indisponíveis para esta cidade.");
  }

  return { city, data };
}

// Atualiza os dados atuais na interface
function renderCurrentWeather(city, current) {
  const [description, icon] = typeFor(current.weather_code);

  setText("location", [city.name, city.admin1, city.country].filter(Boolean).join(" · "));
  setText("local-time", `Horário local: ${localHour(current.time)}`);
  setText("weather-icon", icon);
  setText("temperature", degree(current.temperature_2m));
  setText("condition", description);
  setText("feels-value", degree(current.apparent_temperature));
  setText("humidity-value", `${current.relative_humidity_2m}%`);
  setText("wind-value", `${Math.round(current.wind_speed_10m)} km/h`);
  setText(
    "rain-value",
    `${Number(current.precipitation).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm`
  );
}

// Evento de envio do formulário
form.addEventListener("submit", async event => {
  event.preventDefault();

  const query = input.value.trim();

  if (!query) {
    status.textContent = "Digite o nome de uma cidade para pesquisar.";
    input.focus();
    return;
  }

  // Cancela uma consulta anterior caso o usuário faça outra pesquisa
  if (activeController) {
    activeController.abort();
  }

  const controller = new AbortController();
  activeController = controller;

  button.disabled = true;
  status.textContent = "Consultando os dados meteorológicos…";

  try {
    const { city, data } = await searchWeather(query, controller.signal);

    renderCurrentWeather(city, data.current);
    showForecast(data.hourly, data.current.time);

    results.classList.remove("hidden");
    status.textContent = "Dados atualizados para a cidade pesquisada.";
  } catch (error) {
    if (error.name !== "AbortError") {
      status.textContent = error instanceof TypeError
        ? "Falha de conexão. Verifique sua internet e tente novamente."
        : error.message;
    }
  } finally {
    if (activeController === controller) {
      activeController = null;
      button.disabled = false;
    }
  }
});

// Inicializa os ícones da biblioteca Lucide
if (window.lucide) {
  window.lucide.createIcons();
}
