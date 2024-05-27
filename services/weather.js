const axios = require('axios');

const weatherApiKey = process.env.WEATHER_API_KEY;

const getWeather = async (latitude, longitude) => {
  try {
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
      params: {
        lat: `${latitude}`,
        lon: `${longitude}`,
        appid: weatherApiKey,
        units: 'imperial' // Use 'metric' for Celsius
      }
    });

    const weather = response.data.weather[0].description;
    const temperature = response.data.main.temp;

    return `${weather}, ${temperature}°F`;
  } catch (error) {
    console.error('Error fetching weather data:', error.response ? error.response.data : error.message);
    return null;
  }
};

module.exports = {
  getWeather,
};
