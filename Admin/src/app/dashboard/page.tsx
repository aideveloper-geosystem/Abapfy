import Alert from '@mui/material/Alert'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid2'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined'
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined'
import { LineChart } from '@mui/x-charts/LineChart'
import { getOverviewStats } from '@/lib/queries'
import { KpiCard } from '@/components/KpiCard'
import { formatCompactNumber, formatDay, formatNumber, formatUsd } from '@/lib/format'
import { dashboardColors } from '@/lib/theme'

export const revalidate = 0

export default async function OverviewPage() {
  const stats = await getOverviewStats()

  const chartDates = stats.requestsPerDay.map((d) => formatDay(d.date))
  const requestsSeries = stats.requestsPerDay.map((d) => d.requests)
  const tokensInSeries = stats.tokensPerDay.map((d) => d.input)
  const tokensOutSeries = stats.tokensPerDay.map((d) => d.output)

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" sx={{ fontSize: 24 }}>
          Visão geral
        </Typography>
        <Typography color="text.secondary">
          Últimos 90 dias — dado agregado de todos os usuários do Abapfy.
        </Typography>
      </Stack>

      {stats.unpricedMessages90d > 0 && (
        <Alert severity="warning">
          {formatNumber(stats.unpricedMessages90d)} respostas usaram um modelo sem preço cadastrado —
          o custo estimado abaixo está subestimado. Cadastre o preço em{' '}
          <strong>Preços por modelo</strong>.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard label="Usuários" value={formatNumber(stats.totalUsers)} icon={<GroupOutlinedIcon fontSize="small" />} hint={`${formatNumber(stats.activeUsers7d)} ativos nos últimos 7 dias`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard label="Conversas" value={formatNumber(stats.totalChats)} icon={<ForumOutlinedIcon fontSize="small" />} hint={`${formatNumber(stats.totalMessages90d)} respostas em 90 dias`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            label="Tokens (90d)"
            value={formatCompactNumber(stats.totalTokensInput90d + stats.totalTokensOutput90d)}
            icon={<BoltOutlinedIcon fontSize="small" />}
            hint={`${formatCompactNumber(stats.totalTokensInput90d)} entrada · ${formatCompactNumber(stats.totalTokensOutput90d)} saída`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            label="Custo estimado (90d)"
            value={formatUsd(stats.estimatedCostUsd90d)}
            icon={<PaidOutlinedIcon fontSize="small" />}
            hint="Preço público dos provedores × tokens"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ p: 2.5 }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>Requests por dia</Typography>
            <LineChart
              height={260}
              series={[{ data: requestsSeries, label: 'Respostas', color: dashboardColors.primary, area: true, showMark: false }]}
              xAxis={[{ scaleType: 'point', data: chartDates }]}
              margin={{ left: 40, right: 16, top: 16, bottom: 30 }}
              grid={{ horizontal: true }}
            />
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ p: 2.5 }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>Tokens por dia</Typography>
            <LineChart
              height={260}
              series={[
                { data: tokensInSeries, label: 'Entrada', color: dashboardColors.primaryHover, showMark: false },
                { data: tokensOutSeries, label: 'Saída', color: dashboardColors.success, showMark: false }
              ]}
              xAxis={[{ scaleType: 'point', data: chartDates }]}
              margin={{ left: 50, right: 16, top: 16, bottom: 30 }}
              grid={{ horizontal: true }}
            />
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ p: 2.5 }}>
            <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Uso por modelo</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Modelo</TableCell>
                  <TableCell align="right">Respostas</TableCell>
                  <TableCell align="right">Tokens</TableCell>
                  <TableCell align="right">Custo</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.modelBreakdown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary">
                        Sem uso registrado nos últimos 90 dias.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {stats.modelBreakdown.map((row) => (
                  <TableRow key={row.model}>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip size="small" label={row.provider} sx={{ height: 20, fontSize: 10 }} />
                        <Typography variant="body2">{row.model}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">{formatNumber(row.messages)}</TableCell>
                    <TableCell align="right">{formatCompactNumber(row.tokens)}</TableCell>
                    <TableCell align="right">{formatUsd(row.costUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ p: 2.5 }}>
            <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Top usuários (por tokens)</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Usuário</TableCell>
                  <TableCell align="right">Respostas</TableCell>
                  <TableCell align="right">Tokens</TableCell>
                  <TableCell align="right">Custo</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.topUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary">
                        Sem uso registrado nos últimos 90 dias.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {stats.topUsers.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell>{row.nome}</TableCell>
                    <TableCell align="right">{formatNumber(row.messages)}</TableCell>
                    <TableCell align="right">{formatCompactNumber(row.tokens)}</TableCell>
                    <TableCell align="right">{formatUsd(row.costUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  )
}
