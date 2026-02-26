import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function testAI() {
    console.log('Testing Gemini API key...');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    try {
        const prompt = 'Say "Hello" if you can hear me.';
        const result = await model.generateContent(prompt);
        console.log('Success! Response:', result.response.text());
    } catch (error: any) {
        console.error('AI Error caught:');
        console.error('Status Code:', error.status);
        console.error('Message:', error.message);
        console.error('Details:', JSON.stringify(error, null, 2));
    }
}

testAI();
