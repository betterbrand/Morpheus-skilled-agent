# OpenAI Tools

For agents using the OpenAI tools API directly:

```typescript
import { tools, handleToolCall } from 'morpheus-node-manager';

const config = {
  apiUrl: 'http://localhost:8082',
  apiUser: 'admin',
  apiPassword: 'your-password',
};

// Pass tools to your OpenAI API call
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages,
  tools,
  tool_choice: 'auto',
});

// Handle tool calls from the response
for (const call of response.choices[0].message.tool_calls ?? []) {
  const result = await handleToolCall(
    call.function.name,
    JSON.parse(call.function.arguments),
    config
  );
  // result is a JSON string -- add to messages as a tool response
}
```

`tools` is a static array of OpenAI function-calling schema objects. `handleToolCall(name, args, config)` dispatches to the appropriate core function and returns a JSON string result. Both are typed exports from `dist/index.js`.
