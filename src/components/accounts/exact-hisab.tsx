"use client";

import { useState } from "react";

export function ExactHisab() {
  const [tab, setTab] = useState<"daily" | "parties" | "reports" | "settings">("daily");
  const [period, setPeriod] = useState<"day" | "week" | "month">("month");

  const money = (n: number) => `৳${n.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const tabs = [
    { key: "daily" as const, label: "দৈনিক হিসাব" },
    { key: "parties" as const, label: "পার্টি খাতা" },
    { key: "reports" as const, label: "রিপোর্ট" },
    { key: "settings" as const, label: "খাত ও ব্যালেন্স" },
  ];

  const metrics = [
    { label: "আজকের বিক্রি", value: money(0), tone: "" },
    { label: "আজকের আদায়", value: money(0), tone: "green" },
    { label: "আজকের ক্রয়", value: money(0), tone: "" },
    { label: "আজকের খরচ", value: money(0), tone: "red" },
    { label: "গ্রাহকের পাওনা", value: money(0), tone: "" },
    { label: "সরবরাহকারীকে দেনা", value: money(0), tone: "" },
  ];

  const methods = [
    { label: "নগদ", opening: "০.০০", change: "+০.০০", closing: "০.০০" },
    { label: "বিকাশ", opening: "০.০০", change: "+০.০০", closing: "০.০০" },
    { label: "নগদ (Nagad)", opening: "০.০০", change: "+০.০০", closing: "০.০০" },
    { label: "ব্যাংক", opening: "০.০০", change: "+০.০০", closing: "০.০০" },
    { label: "অন্যান্য", opening: "০.০০", change: "+০.০০", closing: "০.০০" },
  ];

  return (
    <div className="exact-shell">
      <header className="exact-header">
        <div className="exact-header-top">
          <span className="exact-eyebrow">LUXORA · BUSINESS DESK</span>
          <button className="exact-print">প্রিন্ট / PDF</button>
        </div>
        <h1 className="exact-title">হিসাব-নিকাশ</h1>
        <p className="exact-subtitle">প্রতিদিনের লেনদেন, পার্টি খাতা ও ব্যবসার রিপোর্ট—এক জায়গায়।</p>
        <div className="exact-header-bottom">
          <div className="exact-lang">
            <button className="exact-lang-active">বাংলা</button>
            <button className="exact-lang-inactive">English</button>
          </div>
          <div className="exact-date">১৬ নভেম্বর ২০২৫</div>
        </div>
      </header>

      <main className="exact-main">
        <nav className="exact-tabs">
          {tabs.map((t) => (
            <button key={t.key} className={tab === t.key ? "exact-tab active" : "exact-tab"} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </nav>

        <div className="exact-metrics">
          {metrics.map((m, i) => (
            <div key={i} className={`exact-metric ${m.tone}`}><span className="exact-metric-label">{m.label}</span><strong className="exact-metric-value">{m.value}</strong></div>
          ))}
        </div>

        <div className="exact-closing"><span className="exact-closing-label">দিন শেষে মোট ব্যালেন্স</span><strong className="exact-closing-value">{money(0)}</strong></div>

        <section className="exact-panel">
          <div className="exact-panel-head"><span className="exact-eyebrow">দৈনিক হিসাব</span><h2 className="exact-panel-title">দৈনিক এন্ট্রি যোগ</h2></div>
          <div className="exact-entry-grid">
            <label className="exact-field"><span>তারিখ</span><input type="date" /></label>
            <label className="exact-field"><span>পার্টি / খাত</span><input placeholder="নাম লিখুন বা বাছুন" /></label>
            <label className="exact-field exact-full"><span>টাকার পরিমাণ</span><input type="number" step="0.01" placeholder="০.০০" /></label>
            <label className="exact-field"><span>পেমেন্ট মাধ্যম</span><select><option>নগদ</option><option>বিকাশ</option><option>নগদ (Nagad)</option><option>ব্যাংক</option></select></label>
            <label className="exact-field exact-full"><span>খাত</span><select><option>খাত নির্বাচন</option></select></label>
            <label className="exact-field exact-full"><span>নোট</span><textarea rows={1} placeholder="লেনদেনের বিবরণ" /></label>
            <button className="exact-btn-save">হিসাব সংরক্ষণ</button>
          </div>
        </section>

        <section className="exact-panel">
          <div className="exact-panel-head"><span className="exact-eyebrow">গ্রাফ ও বিশ্লেষণ</span><h2 className="exact-panel-title">আয় বনাম ব্যয়</h2></div>
          <div className="exact-period">
            <button className={period === "day" ? "exact-period-btn active" : "exact-period-btn"} onClick={() => setPeriod("day")}>দিন</button>
            <button className={period === "week" ? "exact-period-btn active" : "exact-period-btn"} onClick={() => setPeriod("week")}>সপ্তাহ</button>
            <button className={period === "month" ? "exact-period-btn active" : "exact-period-btn"} onClick={() => setPeriod("month")}>মাস</button>
            <button className="exact-period-btn">বর্ষ</button>
          </div>
          <div className="exact-charts">
            <div className="exact-chart-bar"><h3 className="exact-chart-title">আয় বনাম ব্যয়</h3>
              <div className="exact-bar-wrapper">
                {[1,2,3,4,5,6,7].map((i) => (
                  <div key={i} className="exact-bar-group"><div className="exact-bar income"></div><div className="exact-bar expense"></div></div>
                ))}
              </div>
            </div>
            <div className="exact-chart-donut"><h3 className="exact-chart-title">হিসাবের statistically খরচ</h3>
              <div className="exact-donut">
                <svg className="exact-donut-ring" viewBox="0 0 40 40">
                  <circle className="exact-donut-bg" cx="20" cy="20" r="16" />
                  <circle className="exact-donut-progress" cx="20" cy="20" r="16" strokeDasharray="50 100" />
                </svg>
                <div className="exact-donut-center">০.০০</div>
              </div>
              <ul className="exact-donut-legend">
                <li><span className="exact-swatch income"></span>দেনা</li>
                <li><span className="exact-swatch expense"></span>তাকা</li>
                <li><span className="exact-swatch neutral"></span>বাকি</li>
                <li><span className="exact-swatch other"></span>পার্টি</li>
                <li><span className="exact-swatch last"></span>অন্যান্য</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="exact-panel">
          <div className="exact-panel-head"><span className="exact-eyebrow">মাসিক লাভ-লোকসান</span><h2 className="exact-panel-title">সময়ভিত্তিক লাভ ও লোকসান</h2></div>
          <div className="exact-pl-chart">
            <div className="exact-pl-bar positive"></div><div className="exact-pl-bar positive"></div><div className="exact-pl-bar negative"></div><div className="exact-pl-bar positive"></div><div className="exact-pl-bar negative"></div>
          </div>
          <p className="exact-pl-note">দৈনিক লেনদেনের নমুনা, দিনের হিসাব। এটিই একটি ভিজ্যুয়ালাইজেশন।</p>
        </section>

        <section className="exact-panel">
          <div className="exact-panel-head"><span className="exact-eyebrow">পেমেন্ট মাধ্যম · Opening ও Closing</span><h2 className="exact-panel-title">দিনের চালা</h2></div>
          <div className="exact-table-wrap">
            <table className="exact-table">
              <thead><tr><th>মাধ্যম</th><th className="exact-num">Opening</th><th className="exact-num">দিনের পরিবর্তন</th><th className="exact-num">Closing</th></tr></thead>
              <tbody>
                {methods.map((m, i) => (
                  <tr key={i}><td>{m.label}</td><td className="exact-num">{m.opening}</td><td className="exact-num">{m.change}</td><td className="exact-num exact-bold">{m.closing}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="exact-opening-note"><strong>Opening balance</strong> — প্রতিদিনের Opening Balance অ্যাডমিন নির্ধারণ করেন। সিস্টেম পুরোনো নগদ বা বাকি নিজে থেকে অনুমান করে না।</div>
        </section>

        <section className="exact-panel">
          <div className="exact-panel-head"><span className="exact-eyebrow">লেনদেনের তালিকা · ১৬ নভেম্বর ২০২৫</span><h2 className="exact-panel-title">সকল লেনদেন</h2><button className="exact-csv">CSV ডাউনলোড</button></div>
          <div className="exact-filters"><select><option>সব ধরণ</option></select><select><option>সব پار্টি</option></select><select><option>সব মাধ্যম</option></select></div>
          <div className="exact-table-wrap">
            <table className="exact-table">
              <thead><tr><th>তারিখ</th><th>পার্টি / খাত</th><th>মাধ্যম</th><th className="exact-num">মোট</th><th className="exact-num">জমা</th><th className="exact-num">বাকি</th><th>নোট</th><th>কাজ</th></tr></thead>
              <tbody><tr><td colSpan={8} className="exact-empty"><span className="exact-empty-icon">📄</span><span>এই তারিখে কোনো হিসাব নেই। নতুন এন্ট্রি যোগ করুন।</span></td></tr></tbody>
            </table>
          </div>
        </section>

        <section className="exact-calculator">
          <div className="exact-calc-head"><h2>ক্যালকুলেটর</h2></div>
          <div className="exact-calc-display">0</div>
          <div className="exact-calc-keypad">
            {["C", "%", "⌫", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "="].map((k) => (
              <button key={k} className={`exact-calc-btn ${k === "=" ? "exact-calc-equal" : ""}`}>{k}</button>
            ))}
          </div>
        </section>
      </main>

      <footer className="exact-footer">
        সব লেনদেন পরিবর্তনের অডিটসহ সংরক্ষিত হয়। বাতিল করা হিসাব হারিয়ে যায় না। PDF তৈরির জন্য প্রিন্ট ডায়ালগে “Save as PDF” বেছে নিন।
      </footer>
    </div>
  );
}