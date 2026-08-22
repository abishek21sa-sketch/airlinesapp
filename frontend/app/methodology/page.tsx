import fs from "fs";
import path from "path";
import MarkdownBody from "../components/MarkdownBody";

export default function MethodologyPage() {
  const filePath = path.join(process.cwd(), "app", "methodology", "content.md");
  const content = fs.readFileSync(filePath, "utf-8");

  return (
    <main className="page">
      <header className="header">
        <p className="eyebrow">DOT On-Time Performance &middot; Methodology</p>
        <h1 className="title">How the Health Score works</h1>
        <p className="subtitle">
          The plain-language version, then the full formulas for anyone who wants them.
        </p>
      </header>

      <section className="section">
        <div className="screen markdown-page">
          <MarkdownBody content={content} />
        </div>
      </section>
    </main>
  );
}
