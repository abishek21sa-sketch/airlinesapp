import fs from "fs";
import path from "path";
import MarkdownBody from "../components/MarkdownBody";

export default function GlossaryPage() {
  const filePath = path.join(process.cwd(), "app", "glossary", "content.md");
  const content = fs.readFileSync(filePath, "utf-8");

  return (
    <main className="page">
      <header className="header">
        <p className="eyebrow">DOT On-Time Performance &middot; Glossary</p>
        <h1 className="title">Glossary</h1>
        <p className="subtitle">
          Every term used anywhere on this site, defined once, in one place.
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
