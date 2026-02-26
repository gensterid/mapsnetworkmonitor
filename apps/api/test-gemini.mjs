import { GoogleGenerativeAI } from '@google/generative-ai';

async function run() {
    try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyAclYq6R7liRCnPw-_pwYyYFqpEyjgPq0g');
        const data = await response.json();
        if (data.models) {
            console.log("AVAILABLE MODELS:");
            console.log(data.models.map(m => m.name.replace('models/', '')).join('\n'));
        } else {
            console.log("ERROR OR NO MODELS:");
            console.log(data);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
