"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/status-badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlusIcon, FolderOpenIcon } from "lucide-react"
import { timeAgo } from "@/lib/time-ago"

interface Project {
  id: string
  name: string
  prompt: string
  status: string
  workspacePath: string | null
  deployUrl: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "planning", label: "Planning" },
  { value: "building", label: "Building" },
  { value: "deployed", label: "Deployed" },
  { value: "archived", label: "Archived" },
] as const

type FilterValue = (typeof STATUS_FILTERS)[number]["value"]

export default function ProjectsPage() {
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterValue>("all")

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch("/api/projects")
      const data = await res.json()
      setAllProjects(data)
      setLoading(false)
    }
    load()
  }, [])

  const counts = useMemo(() => {
    const c: Record<FilterValue, number> = { all: 0, draft: 0, planning: 0, building: 0, deployed: 0, archived: 0 }
    for (const p of allProjects) {
      c.all++
      if (p.status in c) c[p.status as FilterValue]++
    }
    return c
  }, [allProjects])

  const projects = useMemo(
    () => filter === "all" ? allProjects : allProjects.filter((p) => p.status === filter),
    [allProjects, filter],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your agent-operated projects.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
        <TabsList>
          {STATUS_FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
              {counts[f.value] > 0 && (
                <span className="ml-1.5 rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums">
                  {counts[f.value]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        allProjects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpenIcon className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium">No projects yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first project to get started.
              </p>
              <Button asChild className="mt-4">
                <Link href="/projects/new">
                  <PlusIcon className="mr-2 h-4 w-4" />
                  New Project
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            No {filter} projects.
          </div>
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="transition-colors hover:border-primary/30">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardTitle className="text-base font-semibold">
                    {project.name}
                  </CardTitle>
                  <StatusBadge status={project.status} />
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {project.prompt}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Created {timeAgo(project.createdAt)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
