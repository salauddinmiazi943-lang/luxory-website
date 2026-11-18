"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/store-context";

type Announcement = {
  _id: string;
  title: { en: string; bn?: string };
  link: string;
  active?: boolean;
  order?: number;
};

export function AnnouncementBar() {
  const { locale } = useStore();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load announcements"))))
      .then((data: { items?: Announcement[] }) => {
        if (!cancelled) setAnnouncements(data.items ?? []);
      })
      .catch(() => setAnnouncements([]));
    return () => { cancelled = true; };
  }, []);

  const displayAnnouncements = announcements.length > 0 ? announcements : [
    { _id: "default", title: { en: "Today's Offer", bn: "আজকের অফার" }, link: "/products", active: true }
  ];

  // একটি group-কে এতটুকু চওড়া করুন যাতে পুরো bar ভরে যায় — নাহলে খুব কম item হলে
  // লেখাগুলোর মাঝখানে ফাঁকা জায়গা দেখায় এবং scroll-টা এলোমেলো লাগে।
  const minItems = 6;
  const copies = Math.max(1, Math.ceil(minItems / displayAnnouncements.length));
  const fill = Array.from({ length: copies }, () => displayAnnouncements).flat();

  if (fill.length === 0) return null;

  return (
    <section className="announcement-bar">
      <div className="announcement-inner">
        <div className="announcement-track" aria-live="off">
          {[0, 1].map((copy) => (
            <div className="announcement-group" key={copy} aria-hidden={copy === 1 || undefined}>
              {fill.map((item, index) => {
                const title = item.title?.[locale] ?? item.title.en ?? "";
                return (
                  <Link
                    key={`${copy}-${item._id}-${index}`}
                    href={item.link || "/products"}
                    className="announcement-item"
                    aria-label={title}
                    tabIndex={copy === 1 ? -1 : undefined}
                  >
                    {title}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
