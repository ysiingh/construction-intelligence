import Chat from "./Chat";

export default function Knowledge() {
  return (
    <Chat endpoint="/api/knowledge/chat" placeholder="Ask about a material, method or term"
      suggestions={["What is concrete curing?", "What does a slump test measure?", "OPC vs PPC cement?", "What is a plinth beam?"]} />
  );
}
