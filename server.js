const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const tmdbApiKey = process.env.TMDB_API_KEY;
const rapidApiKey = process.env.RAPIDAPI_KEY;
const geoApiKey = process.env.GEO_API_KEY;
const weatherApiKey = process.env.WEATHER_API_KEY;

const getCityAndState = async (latitude, longitude) => {
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

    return { city, state };
  } catch (error) {
    console.error('Error fetching city and state:', error.response ? error.response.data : error.message);
    return null;
  }
};

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

app.post('/ask', async (req, res) => {
  const { question } = req.body;
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/completions',
      {
        model: 'text-davinci-003',
        prompt: question,
        max_tokens: 150,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    res.json({ answer: response.data.choices[0].text.trim() });
  } catch (error) {
    res.status(500).json({ error: 'Error interacting with ChatGPT' });
  }
});

app.get('/search', async (req, res) => {
  const query = req.query.q;
  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/search/movie`,
      {
        params: {
          api_key: tmdbApiKey,
          query: query
        }
      }
    );
    if (response.data.results && response.data.results.length > 0) {
      res.json(response.data.results.filter(movie => !movie.adult && movie.poster_path));
    } else {
      res.status(404).json({ error: 'No movies found for the given query' });
    }
  } catch (error) {
    console.error('Error fetching movie data:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Error fetching movie data', details: error.message });
  }
});

app.get('/movie/:id', async (req, res) => {
  const movieId = req.params.id;
  try {
    const tmdbResponse = await axios.get(
      `https://api.themoviedb.org/3/movie/${movieId}`,
      {
        params: {
          api_key: tmdbApiKey
        }
      }
    );
    if (tmdbResponse.data) {
      const movie = tmdbResponse.data;

      try {
        const options = {
          method: 'GET',
          url: `https://streaming-availability.p.rapidapi.com/shows/movie%2f${movieId}`,
          params: {
            country: 'us',
            tmdb_id: movieId,
            output_language: 'en'
          },
          headers: {
            'X-RapidAPI-Key': rapidApiKey,
            'X-RapidAPI-Host': 'streaming-availability.p.rapidapi.com',
          },
        };

        const providersResponse = await axios.request(options);
        movie.streamingProviders = providersResponse.data.streamingOptions;
        res.json(movie);
      } catch (error) {
        console.error('Error fetching streaming providers:', error.response ? error.response.data : error.message);
        res.json(movie);
      }
    } else {
      res.status(404).json({ error: 'Movie not found' });
    }
  } catch (error) {
    console.error('Error fetching movie details:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Error fetching movie details', details: error.message });
  }
});

const getMovieDetails = async (tmdbId) => {
  try {
    const response = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
      params: {
        api_key: tmdbApiKey,
      },
    });

    const movie = response.data;

    const options = {
      method: 'GET',
      url: `https://streaming-availability.p.rapidapi.com/shows/movie%2f${tmdbId}`,
      params: {
        country: 'us',
        tmdb_id: tmdbId,
        output_language: 'en',
      },
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': 'streaming-availability.p.rapidapi.com',
      },
    };

    const providersResponse = await axios.request(options);
    movie.streamingProviders = providersResponse.data.streamingOptions;

    return movie;
  } catch (error) {
    console.error('Error fetching movie details:', error.response ? error.response.data : error.message);
    return null;
  }
};

const getTMDBId = async (title) => {
  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/search/movie`,
      {
        params: {
          api_key: tmdbApiKey,
          query: title
        }
      }
    );
    if (response.data.results && response.data.results.length > 0) {
      return response.data.results[0].id;
    }
    return null;
  } catch (error) {
    console.error('Error fetching TMDB ID:', error.response ? error.response.data : error.message);
    return null;
  }
};

// Endpoint to get movie recommendations using ChatGPT
app.post('/recommendations', async (req, res) => {
  const { currentTime, currentDate, latitude, longitude, genres, mood } = req.body;
  console.log('Request for recommendations:', currentTime, currentDate, latitude, longitude, genres, mood);

  const locationData = await getCityAndState(latitude, longitude);
  if (!locationData) {
    return res.status(500).json({ error: 'Error fetching location data' });
  }

  const { city, state } = locationData;
  console.log('Location data:', city, state);

  const weather = await getWeather(latitude, longitude);
  if (!weather) {
    return res.status(500).json({ error: 'Error fetching weather data' });
  }
  console.log('Weather data:', weather);

  const genresTxt = genres ? `Their favorite genres are ${genres}.` : '';
  const moodTxt = mood ? `They are currently feeling ${mood}.` : '';
  const weatherTxt = weather ? `, where the current weather is ${weather}` : '';

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an expert movie recommendation assistant.' },
          { role: 'user', content: `Recommend 5 must-watch movie titles for someone located in ${city}, ${state}${weatherTxt}. They want to watch at ${currentTime} on ${currentDate}. ${genresTxt} ${moodTxt} Only movie titles.` }
        ],
        max_tokens: 200,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const recommendations = response.data.choices[0].message.content.trim().replaceAll(/^(\d+)\./gm, '').replaceAll("\"", "").split('\n').filter(movie => movie);
    console.log(recommendations);

    // Get movie details for each recommendation
    const recommendationsWithDetails = await Promise.all(recommendations.map(async (title) => {
      const tmdbId = await getTMDBId(title);
      if (tmdbId) {
        const movieDetails = await getMovieDetails(tmdbId);
        return {
          title,
          tmdbId,
          posterPath: movieDetails.poster_path,
          streamingProviders: movieDetails.streamingProviders,
        };
      }
      return { title, tmdbId: null };
    }));

    res.json(recommendationsWithDetails);
  } catch (error) {
    console.error('Error fetching recommendations:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Error fetching recommendations', details: error.message });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));
