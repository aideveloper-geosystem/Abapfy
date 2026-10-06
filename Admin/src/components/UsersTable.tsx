'use client'

import { useMemo, useState } from 'react'
import Chip from '@mui/material/Chip'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined'
import type { UserUsageRow } from '@/lib/queries'
import { formatCompactNumber, formatDate, formatNumber, formatUsd } from '@/lib/format'

export function UsersTable({ users }: { users: UserUsageRow[] }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return users
    return users.filter(
      (user) =>
        user.nome.toLowerCase().includes(term) ||
        (user.empresa ?? '').toLowerCase().includes(term) ||
        (user.cargo ?? '').toLowerCase().includes(term)
    )
  }, [users, search])

  return (
    <Stack spacing={2}>
      <TextField
        size="small"
        placeholder="Buscar por nome, cargo ou empresa…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ maxWidth: 360 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon fontSize="small" />
              </InputAdornment>
            )
          }
        }}
      />
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Usuário</TableCell>
              <TableCell>Empresa / cargo</TableCell>
              <TableCell>Provedores</TableCell>
              <TableCell align="right">Conversas</TableCell>
              <TableCell align="right">Respostas (90d)</TableCell>
              <TableCell align="right">Tokens (90d)</TableCell>
              <TableCell align="right">Custo (90d)</TableCell>
              <TableCell>Última atividade</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {user.nome || '(sem nome)'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    desde {formatDate(user.createdAt)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{user.empresa || '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {user.cargo || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap">
                    {user.providersConfigured.length === 0 && (
                      <Typography variant="caption" color="text.secondary">
                        nenhum
                      </Typography>
                    )}
                    {user.providersConfigured.map((provider) => (
                      <Chip key={provider} label={provider} size="small" sx={{ height: 20, fontSize: 10 }} />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell align="right">{formatNumber(user.chats)}</TableCell>
                <TableCell align="right">{formatNumber(user.messages)}</TableCell>
                <TableCell align="right">{formatCompactNumber(user.tokens)}</TableCell>
                <TableCell align="right">{formatUsd(user.costUsd)}</TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {user.lastActiveAt ? formatDate(user.lastActiveAt) : '—'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    Nenhum usuário encontrado.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  )
}
