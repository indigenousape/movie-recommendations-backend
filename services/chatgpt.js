const axios = require('axios');

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
    prompt += 'They disliked the following movies:\n ' + dislikedMovies.map(str => str).join('\n') + '\n';
  }
  
  prompt += 'No adult movies.';

  prompt += `\nOnly list the movie titles without any additional text or explanation. Provide the response in the following format:\n1. Movie Title 1\n2. Movie Title 2\n3. Movie Title 3\n4. Movie Title 4\n5. Movie Title 5`;

  return prompt;
};

const getRecommendations = async (prompt) => {
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
    return response.data.choices[0].message.content
      .replaceAll("\"", "")
      .replaceAll("*", "")
      .replaceAll(/^(\d+)\.\ /gm, '')
      .replaceAll(/\(\d+\)/gm, '')
      .replaceAll(/\s+$/gm, '')
      .split('\n')
      .filter(movie => movie);
  } catch (error) {
    console.error('Error fetching recommendations:', error.response ? error.response.data : error.message);
    throw error;
  }
};

module.exports = {
  getPrompt,
  getRecommendations,
};
