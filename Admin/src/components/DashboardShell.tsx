'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined'
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined'
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import type { CurrentAdmin } from '@/lib/auth'
import { signOutAction } from '@/app/dashboard/actions'
import { dashboardColors } from '@/lib/theme'

const DRAWER_WIDTH = 240

const ROLE_LABELS: Record<CurrentAdmin['role'], string> = {
  owner: 'Owner',
  admin: 'Admin',
  viewer: 'Leitura'
}

interface NavItem {
  href: string
  label: string
  icon: ReactNode
  ownerOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Visão geral', icon: <DashboardOutlinedIcon fontSize="small" /> },
  { href: '/dashboard/usage', label: 'Uso e requests', icon: <InsightsOutlinedIcon fontSize="small" /> },
  { href: '/dashboard/users', label: 'Usuários', icon: <GroupOutlinedIcon fontSize="small" /> },
  { href: '/dashboard/pricing', label: 'Preços por modelo', icon: <PaidOutlinedIcon fontSize="small" /> },
  {
    href: '/dashboard/admins',
    label: 'Administradores',
    icon: <AdminPanelSettingsOutlinedIcon fontSize="small" />,
    ownerOnly: true
  }
]

export function DashboardShell({
  admin,
  children
}: {
  admin: CurrentAdmin
  children: ReactNode
}) {
  const pathname = usePathname()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  const items = NAV_ITEMS.filter((item) => !item.ownerOnly || admin.role === 'owner')
  const initials = admin.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' }
        }}
      >
        <Toolbar sx={{ px: 2.5 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 17, letterSpacing: '-0.4px' }}>
            Abapfy <Box component="span" sx={{ color: dashboardColors.primary }}>Admin</Box>
          </Typography>
        </Toolbar>
        <Divider />
        <List sx={{ px: 1.5, py: 2 }}>
          {items.map((item) => {
            const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <ListItemButton
                key={item.href}
                component={Link}
                href={item.href}
                selected={active}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(94,106,210,0.16)',
                    color: dashboardColors.primaryHover,
                    '& .MuiListItemIcon-root': { color: dashboardColors.primaryHover }
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 34, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 600 : 500 }}
                />
              </ListItemButton>
            )
          })}
        </List>
      </Drawer>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="sticky" elevation={0} color="transparent">
          <Toolbar sx={{ justifyContent: 'flex-end', gap: 1.5 }}>
            <Chip
              label={ROLE_LABELS[admin.role]}
              size="small"
              sx={{
                backgroundColor: dashboardColors.surface3,
                color: 'text.secondary',
                fontSize: 11
              }}
            />
            <IconButton size="small" onClick={(event) => setMenuAnchor(event.currentTarget)}>
              <Avatar sx={{ width: 30, height: 30, fontSize: 13, bgcolor: dashboardColors.primary }}>
                {initials}
              </Avatar>
            </IconButton>
            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
              <Stack sx={{ px: 2, py: 1 }} spacing={0}>
                <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{admin.name}</Typography>
                <Typography sx={{ fontSize: 12 }} color="text.secondary">
                  {admin.email}
                </Typography>
              </Stack>
              <Divider />
              <form action={signOutAction}>
                <MenuItem component="button" type="submit" sx={{ width: '100%' }}>
                  <ListItemIcon>
                    <LogoutOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  Sair
                </MenuItem>
              </form>
            </Menu>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}
