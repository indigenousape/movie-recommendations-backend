const axios = require('axios');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 43200 });

const tmdbApiKey = process.env.TMDB_API_KEY;
const rapidApiKey = process.env.RAPIDAPI_KEY;

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
    movie.release_dates.results = trimmedResults;

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

module.exports = {
  getMovieDetails,
  getTMDBId,
};
