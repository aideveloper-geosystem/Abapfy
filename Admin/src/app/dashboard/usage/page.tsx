import Card from '@mui/material/Card'
import Grid from '@mui/material/Grid2'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { BarChart } from '@mui/x-charts/BarChart'
import { PieChart } from '@mui/x-charts/PieChart'
import { getOverviewStats } from '@/lib/queries'
import { formatCompactNumber, formatDay, formatNumber, formatUsd } from '@/lib/format'
import { dashboardColors } from '@/lib/theme'

export const revalidate = 0

const PROVIDER_COLORS: Record<string, string> = {
  claude: dashboardColors.primary,
  openai: dashboardColors.success,
  gemini: dashboardColors.warning,
  desconhecido: dashboardColors.inkTertiary
}

export default async function UsagePage() {
  const stats = await getOverviewStats()

  const providerStats = new Map<string, { messages: number; tokens: number; costUsd: number }>()
  for (const row of stats.modelBreakdown) {
    const entry = providerStats.get(row.provider) ?? { messages: 0, tokens: 0, costUsd: 0 }
    entry.messages += row.messages
    entry.tokens += row.tokens
    entry.costUsd += row.costUsd
    providerStats.set(row.provider, entry)
  }

  const pieData = [...providerStats.entries()].map(([provider, entry], index) => ({
    id: index,
    value: entry.tokens,
    label: provider,
    color: PROVIDER_COLORS[provider] ?? dashboardColors.inkTertiary
  }))

  const chartDates = stats.requestsPerDay.slice(-30).map((d) => formatDay(d.date))
  const requests30d = stats.requestsPerDay.slice(-30).map((d) => d.requests)

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" sx={{ fontSize: 24 }}>
          Uso e requests
        </Typography>
        <Typography color="text.secondary">
          Volume de requests e consumo de tokens, últimos 90 dias (gráfico de barras: últimos 30).
        </Typography>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ p: 2.5 }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>Requests por dia (últimos 30 dias)</Typography>
            <BarChart
              height={280}
              series={[{ data: requests30d, label: 'Respostas', color: dashboardColors.primary }]}
              xAxis={[{ scaleType: 'band', data: chartDates }]}
              margin={{ left: 40, right: 16, top: 16, bottom: 30 }}
              grid={{ horizontal: true }}
            />
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>Tokens por provedor</Typography>
            <PieChart
              height={260}
              series={[{ data: pieData, innerRadius: 50, paddingAngle: 2, cornerRadius: 4 }]}
              slotProps={{
                legend: {
                  direction: 'row',
                  position: { vertical: 'bottom', horizontal: 'middle' }
                }
              }}
            />
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ p: 2.5 }}>
        <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Detalhe por provedor</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Provedor</TableCell>
              <TableCell align="right">Respostas</TableCell>
              <TableCell align="right">Tokens</TableCell>
              <TableCell align="right">Custo estimado</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...providerStats.entries()].map(([provider, entry]) => (
              <TableRow key={provider}>
                <TableCell sx={{ textTransform: 'capitalize' }}>{provider}</TableCell>
                <TableCell align="right">{formatNumber(entry.messages)}</TableCell>
                <TableCell align="right">{formatCompactNumber(entry.tokens)}</TableCell>
                <TableCell align="right">{formatUsd(entry.costUsd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Stack>
  )
}
