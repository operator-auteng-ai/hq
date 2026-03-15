"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/status-badge"
import {
  PlusIcon,
  FolderKanbanIcon,
  RocketIcon,
  BotIcon,
} from "lucide-react"

interface Project {
  id: string
  name: string
  prompt: string
  status: string
  createdAt: string
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const activeProjects = projects.filter(
    (p) => !["archived", "paused"].includes(p.status),
  )

  const stats = [
    {
      label: "Projects",
      value: projects.length,
      icon: FolderKanbanIcon,
      href: "/projects",
    },
    {
      label: "Active",
      value: activeProjects.length,
      icon: RocketIcon,
      href: "/projects",
    },
    {
      label: "Agents",
      value: 0,
      icon: BotIcon,
      href: "/agents",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button asChild>
          <Link href="/projects/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition-colors hover:border-primary/30">
              <CardContent className="flex items-center gap-4 py-4">
                <stat.icon className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent Projects */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent Projects</h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">No projects yet.</p>
              <Button asChild className="mt-4">
                <Link href="/projects/new">
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Create your first project
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {projects.slice(0, 5).map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="transition-colors hover:border-primary/30">
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{project.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {project.prompt}
                      </p>
                    </div>
                    <StatusBadge status={project.status} className="ml-4 shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
            {projects.length > 5 && (
              <Button asChild variant="ghost" className="w-full">
                <Link href="/projects">View all projects</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
