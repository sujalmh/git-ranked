import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAiModel } from "@/lib/ai/openrouter";
import { Users, Database, Package } from "lucide-react";
import Link from "next/link";
import { AdminProfileSelector } from "@/components/AdminProfileSelector";
import { AdminModelSelector } from "@/components/AdminModelSelector";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await auth();

  const userGithubId = session?.user?.githubId;

  if (!userGithubId) {
    redirect("/");
  }

  // Verify the user is exactly 'sujalmh'
  const userRecord = await sql`SELECT username FROM app_users WHERE github_id = ${userGithubId}`;
  if (userRecord.length === 0 || userRecord[0].username !== "sujalmh") {
    // Return a 401 or redirect to home if not authorized
    redirect("/");
  }

  // Fetch metrics and current AI model
  const [usersRes, reposRes, installsRes, reposListRes, currentModel] = await Promise.all([
    sql`SELECT count(*) as count FROM app_users`,
    sql`SELECT count(*) as count FROM repositories WHERE is_active = true`,
    sql`SELECT count(*) as count FROM installations WHERE status = 'active'`,
    sql`SELECT id, owner, name, scoring_profile FROM repositories WHERE is_active = true ORDER BY name ASC LIMIT 50`,
    getAiModel(),
  ]);

  const totalUsers = parseInt(usersRes[0]?.count || "0", 10);
  const totalRepos = parseInt(reposRes[0]?.count || "0", 10);
  const activeInstalls = parseInt(installsRes[0]?.count || "0", 10);
  const activeReposList = reposListRes as unknown as Array<{ id: number; owner: string; name: string; scoring_profile: any }>;

  return (
    <div className="min-h-screen bg-black text-white p-8 md:p-16">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-zinc-200 to-zinc-500 bg-clip-text text-transparent">
              Admin Dashboard
            </h1>
            <p className="text-zinc-400 mt-2">
              Live overview of platform health and adoption.
            </p>
          </div>
          <Link 
            href="/"
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-sm font-medium transition-colors inline-flex items-center"
          >
            Back to App
          </Link>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Total Users"
            value={totalUsers.toLocaleString()}
            icon={<Users className="w-5 h-5 text-indigo-400" />}
            gradient="from-indigo-500/20 to-indigo-500/0"
          />
          <StatCard
            title="Active Repositories"
            value={totalRepos.toLocaleString()}
            icon={<Database className="w-5 h-5 text-emerald-400" />}
            gradient="from-emerald-500/20 to-emerald-500/0"
          />
          <StatCard
            title="GitHub App Installs"
            value={activeInstalls.toLocaleString()}
            icon={<Package className="w-5 h-5 text-amber-400" />}
            gradient="from-amber-500/20 to-amber-500/0"
          />
        </div>

        {/* AI Model Selector */}
        <AdminModelSelector initialModel={currentModel} />

        {/* Repository Profiles Selector */}
        {activeReposList.length > 0 && (
          <AdminProfileSelector repos={activeReposList} />
        )}
        
        {/* Further Extensions */}
        <div className="p-8 rounded-2xl bg-zinc-950 border border-zinc-900">
          <h2 className="text-xl font-semibold mb-4 text-zinc-200">System Status</h2>
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.6)]"></div>
            All systems operational. Database connected successfully.
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon, 
  gradient 
}: { 
  title: string; 
  value: string; 
  icon: React.ReactNode; 
  gradient: string;
}) {
  return (
    <div className={`relative overflow-hidden p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-xl group hover:border-zinc-700 transition-colors`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-zinc-400">{title}</p>
          <div className="p-2 rounded-lg bg-black/50 border border-zinc-800">
            {icon}
          </div>
        </div>
        <p className="text-4xl font-bold tracking-tight text-zinc-100">
          {value}
        </p>
      </div>
    </div>
  );
}
