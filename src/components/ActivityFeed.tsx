'use client';

import React from 'react';
import { GitCommit, GitMerge, GitPullRequest, MessageSquare, Play, Tag, Bug, Star } from 'lucide-react';

export type ActivityItem = {
  id: string;
  type: string;
  actor: string;
  avatarUrl: string | null;
  message: string;
  date: Date;
};

const iconMap: Record<string, React.ReactNode> = {
  'pr_merged': <GitMerge className="w-3.5 h-3.5 text-purple-400" />,
  'pr_opened': <GitPullRequest className="w-3.5 h-3.5 text-green-400" />,
  'review_submitted': <MessageSquare className="w-3.5 h-3.5 text-blue-400" />,
  'issue_opened': <Bug className="w-3.5 h-3.5 text-red-400" />,
  'issue_closed': <Bug className="w-3.5 h-3.5 text-zinc-400" />,
  'release': <Tag className="w-3.5 h-3.5 text-yellow-400" />,
  'push': <GitCommit className="w-3.5 h-3.5 text-zinc-400" />,
  'highlight': <Star className="w-3.5 h-3.5 text-yellow-400" />,
};

function formatRelativeDate(date: Date | string) {
  const d = date instanceof Date ? date : new Date(date);
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export function ActivityFeed({ items, identityColors }: { items: ActivityItem[]; identityColors?: Map<string, string> }) {
  const revealed = items.length;

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        No recent activity
      </div>
    );
  }

  return (
    <div 
      className="space-y-2 max-h-[480px] overflow-y-auto pr-3"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}
    >
      {items.map((item, index) => {
        const visible = index < revealed;
        const accent = item.actor ? identityColors?.get(item.actor) : undefined;
        return (
          <div
            key={item.id || index}
            className={`flex gap-3 transition-all duration-300 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
          >
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0"
                style={accent ? { borderColor: accent } : undefined}
              >
                {iconMap[item.type] || <Play className="w-3.5 h-3.5 text-zinc-400" />}
              </div>
              {index !== items.length - 1 && (
                <div className="w-px flex-1 bg-white/10 my-1" />
              )}
            </div>
            <div className="pt-1 pb-2 flex-1 min-w-0">
              <div className="text-sm text-white leading-snug mb-0.5 break-words">
                <span className="font-bold">{item.actor}</span> {item.message}
              </div>
              <div className="text-xs text-zinc-500">
                {formatRelativeDate(item.date)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
