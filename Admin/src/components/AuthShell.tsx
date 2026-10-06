import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { dashboardColors } from '@/lib/theme'

export function AuthShell({
  title,
  subtitle,
  children,
  footer
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `radial-gradient(circle at 50% 0%, ${dashboardColors.surface2} 0%, ${dashboardColors.canvas} 60%)`,
        p: 2
      }}
    >
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 400, p: 4, borderRadius: 3 }}>
        <Stack spacing={0.5} sx={{ mb: 3 }}>
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: 22,
              letterSpacing: '-0.6px',
              color: dashboardColors.ink
            }}
          >
            Abapfy <Box component="span" sx={{ color: dashboardColors.primary }}>Admin</Box>
          </Typography>
          <Typography variant="h5" sx={{ fontSize: 18, fontWeight: 600, mt: 1.5 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        </Stack>
        <Stack spacing={2}>{children}</Stack>
        {footer && (
          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {footer}
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  )
}
