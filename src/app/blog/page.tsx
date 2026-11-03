import Link from "next/link";

export const metadata = { title: "The eshop edit" };
const articles = [
  { category: "BUYING GUIDES", title: "A few thoughtful ways to choose your next headphones", text: "Comfort, battery life, and the kind of sound that makes your everyday playlist feel new again.", icon: "◌" },
  { category: "EVERYDAY TECH", title: "Small upgrades that make a big difference", text: "Simple, useful technology that earns its place on your desk and in your daily routine.", icon: "✦" },
  { category: "THE SHORTLIST", title: "Our little guide to finding a smart watch", text: "From movement reminders to a quick look at your day, find the features you will actually use.", icon: "⌚" },
];

export default function BlogPage() {
  return <div className="page-shell"><p className="breadcrumb"><Link href="/">Home</Link>　/　The eshop edit</p><p className="eyebrow">NOTES, IDEAS & EVERYDAY INSPIRATION</p><h1 className="page-title">The eshop edit.</h1><p className="subtle" style={{ maxWidth: 520, lineHeight: 1.8 }}>A few considered thoughts on useful tech, good design, and the little things that make every day better.</p>
    <div className="blog-grid">{articles.map((article) => <article className="blog-card" key={article.title}><div className="blog-art">{article.icon}</div><p className="eyebrow">{article.category}</p><h2>{article.title}</h2><p>{article.text}</p><Link className="text-link" href="/products">Explore the edit →</Link></article>)}</div>
  </div>;
}
