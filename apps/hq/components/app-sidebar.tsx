"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import {
  LayoutDashboardIcon,
  FolderKanbanIcon,
  BotIcon,
  RocketIcon,
  SettingsIcon,
  ArrowLeftIcon,
  GaugeIcon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { StatusBadge } from "@/components/status-badge"

const globalNavItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboardIcon },
  { title: "Projects", href: "/projects", icon: FolderKanbanIcon },
  { title: "Agents", href: "/agents", icon: BotIcon },
  { title: "Deploys", href: "/deploys", icon: RocketIcon },
]

const bottomItems = [
  { title: "Settings", href: "/settings", icon: SettingsIcon },
]

interface ProjectInfo {
  id: string
  name: string
  status: string
}

function extractProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/)
  if (!match) return null
  // Exclude /projects/new
  if (match[1] === "new") return null
  return match[1]
}

export function AppSidebar() {
  const pathname = usePathname()
  const projectId = extractProjectId(pathname)
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [loadedForId, setLoadedForId] = useState<string | null>(null)

  // Clear project when navigating away
  if (!projectId && project) {
    setProject(null)
    setLoadedForId(null)
  }

  useEffect(() => {
    if (!projectId || projectId === loadedForId) return

    let cancelled = false
    async function load() {
      const res = await fetch(`/api/projects/${projectId}`)
      if (res.ok && !cancelled) {
        const data = await res.json()
        setProject({ id: data.id, name: data.name, status: data.status })
        setLoadedForId(data.id)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, loadedForId])

  // Project-scoped mode
  if (projectId && project) {
    const projectNavItems = [
      { title: "Cockpit", href: `/projects/${projectId}`, icon: GaugeIcon },
      { title: "Agents", href: `/projects/${projectId}/agents`, icon: BotIcon },
      { title: "Deploys", href: `/projects/${projectId}/deploys`, icon: RocketIcon },
    ]

    return (
      <Sidebar>
        <SidebarHeader className="px-4 py-3 space-y-3">
          <Link
            href="/projects"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="h-3 w-3" />
            All Projects
          </Link>
          <div className="space-y-1">
            <p className="text-sm font-semibold truncate">{project.name}</p>
            <StatusBadge status={project.status} />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Project</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {projectNavItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        item.href === `/projects/${projectId}`
                          ? pathname === `/projects/${projectId}`
                          : pathname.startsWith(item.href)
                      }
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            {bottomItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={pathname === item.href}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <SidebarSeparator />
          <ThemeToggle />
        </SidebarFooter>
      </Sidebar>
    )
  }

  // Global mode
  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <span className="text-lg font-bold tracking-tight">AutEng HQ</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {globalNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href)
                    }
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {bottomItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={pathname === item.href}>
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <SidebarSeparator />
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  )
}
