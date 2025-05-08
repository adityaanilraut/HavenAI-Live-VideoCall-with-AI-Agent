// Import axios for HTTP requests
import axios from 'axios';

// API base URLs
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';
const HEYGEN_API_URL = 'https://api.heygen.com/v1';

/**
 * Get response from Gemini AI
 * @param {string} message - The user's message
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<string>} - The AI's response text
 */
// const systemPrompt = 'You are a helpful mental health assistant. Answer the user\'s questions concisely and one liner. never give bounding box detections. just answer the question.';
const systemPrompt = `
You are an AI assistant who's name is "Monica", capable of analyzing images and engaging in multi-turn conversations. Your tasks include:

1. Analyzing the current image when provided.
2. Maintaining awareness of the conversation history, including previously discussed images.
3. Determining if the user's query relates to the current image, a previous image, or general conversation.
4. Providing helpful, respectful, and concise responses.
5. Clearly distinguishing between current and previously discussed images in your responses.
6. Refer to the person in image as "You", rather than "The person" or "The man/woman".
7. Again in prompt refer the main person in the image as "You", as you are saying the answer to them.
8. The Answer should not exceed 2 lines, striclty keep it under 2 lines
9. Dont say anything except the short and clear answer of the user query, do not describe anything
10. You don't have to answer all the questions from the current image, you may or may not have to, it depends on the question
11. Do not include emojis in the answer

 

Guidelines:
- Always analyze the current image when a new one is provided.
- Keep track of details from previously discussed images and the conversation history.
- If a query seems to refer to a previous image, respond based on that image's details from the conversation history.
- Clearly state whether you're referring to the current image or a previous one in your response.
- If unsure about which image or context a query refers to, ask the user for clarification.
- Do not make assumptions about information not present in the current image, previous images, or conversation history.
- Respond concisely, avoid commenting on appearance or background.
- Focus only on the questions asked.
- Respond with a friendly personality, and keep things light and amable.
- Again, it's CRITICAL to be concise and KEEP YOUR RESPONSE SHORT.
- Do not assume that questions are always from the current image.
- Do not include emojis in the answer
`;
export async function getGeminiResponse(message, apiKey) {
  try {
    // Construct the request body
    const requestBody = {
      prompt: systemPrompt + '\n' + message,
      temperature: 0.7,
      maxOutputTokens: 20,
      topP: 0.95,
      topK: 40,
      stopSequences: ['\n']
    };
    
    // Make the API request
    const response = await axios.post(
      `${GEMINI_API_URL}/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      requestBody
    );
    
    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Error getting Gemini response:', error);
    throw new Error('Failed to get response from Gemini AI');
  }
}


/**
 * Generate a HeyGen avatar video
 * @param {string} text - The text to convert to speech
 * @param {string} apiKey - HeyGen API key
 * @param {string} avatarId - Optional avatar ID (defaults to a female avatar)
 * @param {string} voiceId - Optional voice ID (defaults to a female voice)
 * @returns {Promise<string>} - URL of the generated video
 */
export async function generateHeyGenVideo(text, apiKey, avatarId = 'Wayne_20240711', voiceId = 'voice_f_001') {
  try {
    // Create a talk video task
    const createResponse = await axios.post(`${HEYGEN_API_URL}/talk/tasks`, {
      avatar_id: avatarId,
      voice_id: voiceId,
      text: text,
      voice_setting: {
        stability: 0.7,
        similarity: 0.7
      },
      background_image_id: null,
      background_video_id: null
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      }
    });
    
    const taskId = createResponse.data.data.task_id;
    
    // Poll for task completion
    let videoUrl = null;
    let attempts = 0;
    
    while (!videoUrl && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const statusResponse = await axios.get(`${HEYGEN_API_URL}/talk/tasks/${taskId}`, {
        headers: {
          'X-Api-Key': apiKey
        }
      });
      
      const status = statusResponse.data.data.status;
      
      if (status === 'completed') {
        videoUrl = statusResponse.data.data.video_url;
      } else if (status === 'failed') {
        throw new Error('HeyGen video generation failed');
      }
      
      attempts++;
    }
    
    if (!videoUrl) {
      throw new Error('Timeout waiting for HeyGen video generation');
    }
    
    return videoUrl;
  } catch (error) {
    console.error('Error generating HeyGen video:', error);
    throw new Error('Failed to generate HeyGen avatar video');
  }
}

/**
 * Get available HeyGen avatars
 * @param {string} apiKey - HeyGen API key
 * @returns {Promise<Array>} - List of available avatars
 */
export async function getHeyGenAvatars(apiKey) {
  try {
    const response = await axios.get(`${HEYGEN_API_URL}/avatars`, {
      headers: {
        'X-Api-Key': apiKey
      }
    });
    
    return response.data.data.avatars;
  } catch (error) {
    console.error('Error getting HeyGen avatars:', error);
    throw new Error('Failed to get HeyGen avatars');
  }
}

/**
 * Get available HeyGen voices
 * @param {string} apiKey - HeyGen API key
 * @returns {Promise<Array>} - List of available voices
 */
export async function getHeyGenVoices(apiKey) {
  try {
    const response = await axios.get(`${HEYGEN_API_URL}/voices`, {
      headers: {
        'X-Api-Key': apiKey
      }
    });
    
    return response.data.data.voices;
  } catch (error) {
    console.error('Error getting HeyGen voices:', error);
    throw new Error('Failed to get HeyGen voices');
  }
} 