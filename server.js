const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 43200 }); // Cache for 1 hour
require('dotenv').config();

const { getCityAndState } = require('./services/geolocation');
const { getWeather } = require('./services/weather');
const { getMovieDetails, getTMDBId } = require('./services/movie');
const { getPrompt, getRecommendations } = require('./services/chatgpt');

const app = express();
app.use(cors());
app.use(express.json());

const tmdbApiKey = process.env.TMDB_API_KEY;

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

  const cacheKey = `searchquery_${query}`;
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    console.log('Using cached data for search query', query);
    return res.json(cachedData);
  } else {
    console.log('No cached data found for search query', query);
  }

  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/search/movie`,
      {
        params: {
          api_key: tmdbApiKey,
          query: query,
          include_adult: false
        }
      }
    );
    if (response.data.results && response.data.results.length > 0) {

      const searchResults = response.data.results.filter(movie => !movie.adult && movie.poster_path);
      cache.set(cacheKey, searchResults);

      res.json(searchResults);
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

  const cacheKey = `movie_detail_${movieId}`;
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    console.log('Using cached data for movie details', movieId);
    return res.json(cachedData);
  } else {
    console.log('No cached data found for movie details', movieId);
  }

  try {
    const movie = await getMovieDetails(movieId);
    if (movie) {
      res.json(movie);
    } else {
      res.status(404).json({ error: 'Movie not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error fetching movie details', details: error.message });
  }
});

app.post('/recommendations', async (req, res) => {
  const { currentTime, month, dayOfWeek, latitude, longitude, genres, mood, gender, age, language, seenMovies, likedMovies, dislikedMovies } = req.body;
  console.log('\n\nRecommendations request received\n\n');
  const locationData = await getCityAndState(latitude, longitude);
  if (!locationData) {
    return res.status(500).json({ error: 'Error fetching location data' });
  }
  const { city, state } = locationData;

  const weather = await getWeather(latitude, longitude);
  if (!weather) {
    return res.status(500).json({ error: 'Error fetching weather data' });
  }

  console.log('Recommendations request:', dayOfWeek, month, currentTime, city, state, weather, genres, mood, gender, age, language, seenMovies, likedMovies, dislikedMovies);

  let prompt = getPrompt(currentTime, month, dayOfWeek, city, state, weather, genres, mood, age, language, seenMovies, likedMovies, dislikedMovies);

  console.log('prompt', prompt);

  try {
    const recommendations = await getRecommendations(prompt);
    const recommendationsWithDetails = await Promise.all(recommendations.map(async (title) => {
      const titleWithoutYear = title.indexOf('(') === -1 ? title : title.replace(/\s\(\d{4}\)/, '');

      const tmdbId = await getTMDBId(titleWithoutYear);
      if (tmdbId) {
        const movieDetails = await getMovieDetails(tmdbId);
        return {
          title,
          tmdbId,
          backdrop_path: movieDetails.backdrop_path,
          posterPath: movieDetails.poster_path,
          streamingProviders: movieDetails.streamingProviders,
        };
      }
      return { title, tmdbId: null };
    }));

    res.json(recommendationsWithDetails);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching recommendations', details: error.message });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));
