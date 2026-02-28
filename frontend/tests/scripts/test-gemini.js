const { ProxyAgent, setGlobalDispatcher } = require("undici");
const { GoogleGenAI } = require("@google/genai");

// 设置全局代理
const proxyAgent = new ProxyAgent("http://127.0.0.1:7890");
setGlobalDispatcher(proxyAgent);

async function testGeminiAPI() {
  const apiKey = "AIzaSyAdqSRYc-D_EOg2wQwgpknoO3_LcK1MPP4";

  console.log("=== Gemini API 测试 (代理: 127.0.0.1:7890) ===\n");

  const genAI = new GoogleGenAI({ apiKey });

  console.log("正在测试 API 连接...\n");

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [{ text: "请用一句话回答：1+1等于几？" }],
        },
      ],
    });

    const text = response.text();

    console.log("✅ API 调用成功！");
    console.log("\n--- API 响应 ---");
    console.log(text);
    console.log("----------------");
    console.log("\n🎉 Gemini API 工作正常！");
  } catch (error) {
    console.error("❌ API 调用失败");
    console.error("错误:", error.message);
  }
}

testGeminiAPI();
