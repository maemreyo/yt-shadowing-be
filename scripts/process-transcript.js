#!/usr/bin/env node
// Sample script to process a YouTube video transcript

const axios = require('axios');

const API_URL = 'http://localhost:3000/api';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-token';

async function processVideo(videoId) {
  try {
    console.log(`Processing video: ${videoId}`);

    // First, get video info
    const videoResponse = await axios.get(
      `${API_URL}/youtube/video/${videoId}`,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    console.log(`Video: ${videoResponse.data.data.title}`);

    // Get transcript
    const transcriptResponse = await axios.get(
      `${API_URL}/transcript/${videoId}`,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    const transcript = transcriptResponse.data.data;
    console.log(`Transcript found: ${transcript.sentences.length} sentences`);
    console.log(`Difficulty: ${transcript.difficulty}/5`);
    console.log(`Duration: ${Math.round(transcript.duration / 60)} minutes`);

    // Analyze transcript
    const analysisResponse = await axios.get(
      `${API_URL}/transcript/${videoId}/analysis`,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    const analysis = analysisResponse.data.data;
    console.log(`\nAnalysis:`);
    console.log(`- Speaking rate: ${Math.round(analysis.averageSpeakingRate)} WPM`);
    console.log(`- Vocabulary level: ${analysis.vocabularyLevel}`);
    console.log(`- Suitable for: ${analysis.suitableForLevels.join(', ')}`);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Get video ID from command line
const videoId = process.argv[2];
if (!videoId) {
  console.log('Usage: node process-transcript.js <videoId>');
  process.exit(1);
}

processVideo(videoId);
