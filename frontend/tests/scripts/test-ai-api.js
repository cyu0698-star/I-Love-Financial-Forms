const AI_API_KEY = 'sk-MMWb8B4jvJ0SPV68RhwKIE04xPcv3fzM5ZUCYONwaxBXcbtD';
const AI_API_ENDPOINT = 'https://www.chatgtp.cn/v1/chat/completions';
const AI_MODEL = 'gpt-4o-mini';

async function testAPI() {
  console.log("=== AI API 测试 ===\n");
  console.log(`API 端点: ${AI_API_ENDPOINT}`);
  console.log(`模型: ${AI_MODEL}\n`);
  
  const requestBody = {
    model: AI_MODEL,
    messages: [
      {
        role: "user",
        content: "请用一句话回答：1+1等于几？"
      }
    ],
    max_tokens: 100,
  };

  console.log("正在测试 API 连接...\n");

  try {
    const response = await fetch(AI_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`HTTP 状态码: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ API 响应错误:", errorText);
      return;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    
    console.log("\n✅ API 调用成功！");
    console.log("\n--- API 响应 ---");
    console.log(text);
    console.log("----------------");
    console.log("\n🎉 AI API 工作正常！");
  } catch (error) {
    console.error("❌ API 调用失败");
    console.error("错误:", error.message);
  }
}

testAPI();
