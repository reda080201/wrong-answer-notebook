import MathText from "../../components/MathText";
export default function AiMessageContent({ text }: {
    text: string;
}) {
    return <div className="ai-message-content">{text.split(/(```[\s\S]*?```)/g).filter(Boolean).map((part, i) => part.startsWith("```") ? <pre key={i}><code>{part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "")}</code></pre> : <MathText key={i} text={part}/>)}</div>;
}
