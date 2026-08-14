import { GoogleGenAI } from '@google/genai';
delete process.env.GOOGLE_API_KEY;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Hello'
    });
    console.log("Success:", response.text);
  } catch (e) {
    console.log("Error:", e.message);
  }
}
test();
