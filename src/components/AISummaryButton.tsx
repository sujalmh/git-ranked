'use client';

import { Brain } from 'lucide-react';
import { useState } from 'react';

export function AISummaryButton({ repoId, contributorId }: { repoId: number, contributorId: number }) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const handleGenerateSummary = async () => {
    setLoading(true);
    try {
      setSummary("Generating summary...");
      
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          repoId, 
          contributorId, 
          dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          dateTo: new Date().toISOString().split('T')[0]
        })
      });

      const data = await res.json();
      if (data.summary) {
        setSummary(data.summary);
      } else {
        setSummary("Failed to generate summary.");
      }
    } catch (e) {
      console.error(e);
      setSummary("Error generating summary.");
    }
    setLoading(false);
  };

  return (
    <div className="w-full">
        <div className="flex justify-end mb-12">
          <button 
            onClick={handleGenerateSummary}
            disabled={loading}
            className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium transition-all shadow-lg shadow-purple-500/20 flex items-center gap-2"
          >
            <Brain className="w-5 h-5" />
            {loading ? 'Analyzing...' : 'Generate AI Summary'}
          </button>
        </div>

        {summary && (
          <div className="glass-card p-8 mb-12 border-purple-500/30 text-left">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-purple-400">
              <Brain className="w-6 h-6" /> AI Impact Summary
            </h2>
            <div className="prose prose-invert max-w-none text-zinc-300">
              {summary.split('\n').map((line, i) => <p key={i}>{line}</p>)}
            </div>
          </div>
        )}
    </div>
  );
}
