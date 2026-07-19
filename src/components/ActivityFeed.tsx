import React from 'react';
import { GitCommit, GitMerge, GitPullRequest, MessageSquare, Play, Tag, Bug, Star } from 'lucide-react';

export type ActivityItem = {
  id: string;
  type: string;
  actor: string;
  avatarUrl: string | null;
  message: string;
  date: Date;
  metadata?: Record<string, unknown>;
};

const iconMap: Record<string, React.ReactNode> = {
  'pr_merged': <GitMerge className="w-4 h-4 text-purple-400" />,
  'pr_opened': <GitPullRequest className="w-4 h-4 text-green-400" />,
  'review_submitted': <MessageSquare className="w-4 h-4 text-blue-400" />,
  'issue_opened': <Bug className="w-4 h-4 text-red-400" />,
  'issue_closed': <Bug className="w-4 h-4 text-zinc-400" />,
  'release': <Tag className="w-4 h-4 text-yellow-400" />,
  'push': <GitCommit className="w-4 h-4 text-zinc-400" />,
  'highlight': <Star className="w-4 h-4 text-yellow-400" />,
};

function formatRelativeDate(date: Date) {
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        No recent activity
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.id || index} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0">
              {iconMap[item.type] || <Play className="w-4 h-4 text-zinc-400" />}
            </div>
            {index !== items.length - 1 && (
              <div className="w-px h-full bg-white/5 my-1" />
            )}
          </div>
          <div className="pt-1 pb-4 flex-1">
            <div className="text-sm font-medium text-white mb-1">
              <span className="font-bold">{item.actor}</span> {item.message}
            </div>
            <div className="text-xs text-zinc-500">
              {formatRelativeDate(item.date)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
