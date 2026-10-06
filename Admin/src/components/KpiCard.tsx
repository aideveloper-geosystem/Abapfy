import type { ReactNode } from 'react'
import Card from '@mui/material/Card'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import { dashboardColors } from '@/lib/theme'

export function KpiCard({
  label,
  value,
  hint,
  icon
}: {
  label: string
  value: string
  hint?: string
  icon?: ReactNode
}) {
  return (
    <Card sx={{ p: 2.5, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ color: dashboardColors.inkSubtle, fontWeight: 500 }}>
            {label}
          </Typography>
          <Typography sx={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.5px' }}>{value}</Typography>
          {hint && (
            <Typography variant="caption" color="text.secondary">
              {hint}
            </Typography>
          )}
        </Stack>
        {icon && (
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(94,106,210,0.14)',
              color: dashboardColors.primaryHover
            }}
          >
            {icon}
          </Box>
        )}
      </Stack>
    </Card>
  )
}
