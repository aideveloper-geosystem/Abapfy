import { redirect } from 'next/navigation'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined'
import { requireAdmin } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { formatDate } from '@/lib/format'
import { inviteAdminAction, removeAdminAction, revokeInviteAction } from './actions'

export const revalidate = 0

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', viewer: 'Leitura' }

export default async function AdminsPage() {
  const admin = await requireAdmin()
  if (admin.role !== 'owner') redirect('/dashboard')

  const supabase = createSupabaseAdminClient()
  const [{ data: admins }, { data: invites }] = await Promise.all([
    supabase.from('admin_users').select('id, name, email, role, created_at').order('created_at'),
    supabase
      .from('admin_invites')
      .select('id, email, role, created_at')
      .is('accepted_at', null)
      .order('created_at', { ascending: false })
  ])

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" sx={{ fontSize: 24 }}>
          Administradores
        </Typography>
        <Typography color="text.secondary">
          Visível só pro owner. Convide por e-mail — o registro em /register só é aceito pra e-mails
          convidados aqui.
        </Typography>
      </Stack>

      <Card sx={{ p: 2.5 }}>
        <Typography sx={{ fontWeight: 600, mb: 2 }}>Convidar administrador</Typography>
        <form action={inviteAdminAction}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-end' }}>
            <TextField name="email" type="email" label="E-mail" size="small" required sx={{ minWidth: 260 }} />
            <TextField name="role" label="Papel" select size="small" defaultValue="admin" sx={{ width: 140 }}>
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="viewer">Leitura</MenuItem>
              <MenuItem value="owner">Owner</MenuItem>
            </TextField>
            <IconButton type="submit" color="primary" title="Convidar">
              <PersonAddAltOutlinedIcon />
            </IconButton>
          </Stack>
        </form>
      </Card>

      <Card sx={{ p: 2.5 }}>
        <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Convites pendentes</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>E-mail</TableCell>
              <TableCell>Papel</TableCell>
              <TableCell>Convidado em</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {(invites ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary">
                    Nenhum convite pendente.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {(invites ?? []).map((invite) => (
              <TableRow key={invite.id}>
                <TableCell>{invite.email}</TableCell>
                <TableCell>
                  <Chip size="small" label={ROLE_LABELS[invite.role] ?? invite.role} />
                </TableCell>
                <TableCell>{formatDate(invite.created_at)}</TableCell>
                <TableCell align="right">
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="id" value={invite.id} />
                    <IconButton type="submit" size="small" color="error" title="Revogar convite">
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card sx={{ p: 2.5 }}>
        <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Administradores ativos</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>E-mail</TableCell>
              <TableCell>Papel</TableCell>
              <TableCell>Desde</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {(admins ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.email}</TableCell>
                <TableCell>
                  <Chip size="small" label={ROLE_LABELS[row.role] ?? row.role} />
                </TableCell>
                <TableCell>{formatDate(row.created_at)}</TableCell>
                <TableCell align="right">
                  {row.id !== admin.id && (
                    <form action={removeAdminAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <IconButton type="submit" size="small" color="error" title="Remover acesso">
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Stack>
  )
}
