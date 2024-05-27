const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 43200 }); // Cache for 1 hour
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const tmdbApiKey = process.env.TMDB_API_KEY;
const rapidApiKey = process.env.RAPIDAPI_KEY;
const geoApiKey = process.env.GEO_API_KEY;
const weatherApiKey = process.env.WEATHER_API_KEY;

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
    const tmdbResponse = await axios.get(
      `https://api.themoviedb.org/3/movie/${movieId}`,
      {
        params: {
          api_key: tmdbApiKey,
          append_to_response: 'release_dates',
          include_adult: false
        }
      }
    );
    if (tmdbResponse.data) {
      const movie = tmdbResponse.data;
      const trimmedResults = movie.release_dates.results.filter(result => result.iso_3166_1 === 'US');

      // const movie = rawMovie;
      movie.release_dates.results = trimmedResults;

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
        movie.cast = providersResponse.data.cast;
        movie.directors = providersResponse.data.directors;
        
        cache.set(cacheKey, movie); // Store the data in cache
        res.json(movie);
      } catch (error) {
        console.error('Error fetching streaming providers:', error.response ? error.response.data : error.message);
        cache.set(cacheKey, movie); // Store the data in cache even if providers fail
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

  const cacheKey = `movie_detail_${tmdbId}`;
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    console.log('Using cached data for suggested movie details', tmdbId);
    return cachedData;
  } else {
    console.log('No cached data found for suggested movie details', tmdbId);
  }

  try {
    const response = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
      params: {
        api_key: tmdbApiKey,
        append_to_response: 'release_dates',
        include_adult: false
      },
    });

    const movie = response.data;
    const trimmedResults = movie.release_dates.results.filter(result => result.iso_3166_1 === 'US');

    // const movie = tmdbResponse.data;
    movie.release_dates.results = trimmedResults;

    // const movie = response.data;

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
    movie.cast = providersResponse.data.cast;
    movie.directors = providersResponse.data.directors;

    cache.set(cacheKey, movie);

    return movie;
  } catch (error) {
    console.error('Error fetching movie details:', error.response ? error.response.data : error.message);
    return null;
  }
};

const getTMDBId = async (title) => {

  const cacheKey = `tmdb_id_${title.replaceAll(' ', '_')}`;
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    console.log('Using cached movie details for TMDB ID');
    return cachedData;
  } else {
    console.log('No cached movie details found for TMDB ID');
  }

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
      cache.set(cacheKey, response.data.results[0].id);
      return response.data.results[0].id;
    }
    return null;
  } catch (error) {
    console.error('Error fetching TMDB ID:', error.response ? error.response.data : error.message);
    return null;
  }
};

const getPrompt = (currentTime, month, dayOfWeek, city, state, weather, genres, mood, age, language, seenMovies, likedMovies, dislikedMovies) => {

  let prompt = `Recommend a list of 5 ${language}-language movie titles for a person based on the following details:\n`;
  
  if (age) {
    prompt += 'Age: ' + age + '\n';
  }
  
  if (city && state) {
    prompt += 'Location: ' + city + ', ' + state + '\n';
  }
  
  if (weather) {
    prompt += 'Weather: ' + weather + '\n';
  }
  
  prompt += 'Watch Time: ' + currentTime + ' on a ' + dayOfWeek + ' in ' + month + '\n';
  
  if (genres) {
    prompt += 'Favorite Genres: ' + genres + '\n';
  }

  if (mood) {
    prompt += 'Mood: ' + mood + '\n';
  }
  
  if (seenMovies.length > 0) {
    prompt += 'Do not suggest the following movies:\n ' + seenMovies.map(str => str).join('\n') + '\n';
  }

  if (age < 18) {
    prompt += 'Do not suggest movies that are rated R.\n';
  }
  
  if (likedMovies.length > 0) {
    prompt += 'They liked the following movies:\n ' + likedMovies.map(str => str).join('\n') + '\n';
  }
  
  if (dislikedMovies.length > 0) {
    prompt += 'They disliked the following movies:\n ' + dislikedMovies.map(str => str).join('\n') + '\n'
  }
  
  prompt += 'No adult movies.';

  prompt += `\nOnly list the movie titles without any additional text or explanation. Provide the response in the following format:\n1. Movie Title 1\n2. Movie Title 2\n3. Movie Title 3\n4. Movie Title 4\n5. Movie Title 5`;

  return prompt;

}

// Endpoint to get movie recommendations using ChatGPT
app.post('/recommendations', async (req, res) => {
  const { currentTime, month, dayOfWeek, latitude, longitude, genres, mood, gender, age, language, seenMovies, likedMovies, dislikedMovies } = req.body;
  console.log('\n\nRecommendations request received\n\n');
  const locationData = await getCityAndState(latitude, longitude);
  // To Do: Does this need to die if location data is not available?
  if (!locationData) {
    return res.status(500).json({ error: 'Error fetching location data' });
  }
  const { city, state } = locationData;

  const weather = await getWeather(latitude, longitude);
  if (!weather) {
    // To Do: Does this need to die if weather data is not available?
    return res.status(500).json({ error: 'Error fetching weather data' });
  }

  console.log('Recommendations request:', dayOfWeek, month, currentTime, city, state, weather, genres, mood, gender, age, language, seenMovies, likedMovies, dislikedMovies);

  let prompt = getPrompt(currentTime, month, dayOfWeek, city, state, weather, genres, mood, age, language, seenMovies, likedMovies, dislikedMovies);

  console.log('prompt', prompt);

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an expert movie recommendation assistant.' },
          { role: 'user', content: prompt }
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
    const recommendations = response.data.choices[0].message.content
      .replaceAll("\"", "")
      .replaceAll("*", "")
      .replaceAll(/^(\d+)\.\ /gm, '')
      .replaceAll(/\(\d+\)/gm, '')
      .replaceAll(/\s+$/gm, '')
      .split('\n')
      .filter(movie => movie);
    console.log(recommendations);

    // Get movie details for each recommendation
    const recommendationsWithDetails = await Promise.all(recommendations.map(async (title) => {
      
      // Remove year from title if present
      const titleWithoutYear = title.indexOf('(') === -1 ? title : title.replace(/\s\(\d{4}\)/, '');

      const tmdbId = await getTMDBId(titleWithoutYear);
      if (tmdbId) {
        const movieDetails = await getMovieDetails(tmdbId);
        // Big To Do: If streaming providers are found that match the user's settings, add the movie with details to list until there are 5
        return {
          title,
          tmdbId,
          backdrop_path: movieDetails.backdrop_path,
          posterPath: movieDetails.poster_path,
          streamingProviders: movieDetails.streamingProviders,
        };
      }
      // If TMDB ID is not found, return the title without details
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
