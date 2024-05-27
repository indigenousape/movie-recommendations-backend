const axios = require('axios');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 43200 });

const geoApiKey = process.env.GEO_API_KEY;

const getCityAndState = async (latitude, longitude) => {
  const cacheKey = `citystate_${latitude}${longitude}`;
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    console.log('Using cached city and state details');
    return cachedData;
  } else {
    console.log('No cached city and state details found');
  }

  try {
    const response = await axios.get(`https://geocode.maps.co/reverse`, {
      params: {
        lat: latitude,
        lon: longitude,
        api_key: geoApiKey
      }
    });

    const data = response.data;
    const city = data.address.city || data.address.town || data.address.village;
    const state = data.address.state;
    cache.set(cacheKey, { city, state });
    return { city, state };
  } catch (error) {
    console.error('Error fetching city and state:', error.response ? error.response.data : error.message);
    return null;
  }
};

module.exports = {
  getCityAndState,
};
