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
  const { t, locale } = useStore();
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

  if (displayAnnouncements.length === 0) return null;

  return (
    <section className="announcement-bar">
      <div className="announcement-inner">
        <div className="announcement-track" aria-live="off">
          {[...displayAnnouncements, ...displayAnnouncements].map((item, index) => {
            const title = item.title?.[locale] ?? item.title.en ?? "";
            return (
              <Link
                key={`${item._id}-${index}`}
                href={item.link || "/products"}
                className="announcement-item"
                aria-label={title}
                tabIndex={index >= displayAnnouncements.length ? -1 : undefined}
              >
                {title}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
