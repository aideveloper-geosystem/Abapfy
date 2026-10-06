import Card from '@mui/material/Card'
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
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import AddOutlinedIcon from '@mui/icons-material/AddOutlined'
import { requireAdmin } from '@/lib/auth'
import { getPricingRows } from '@/lib/queries'
import { formatDate } from '@/lib/format'
import { addPricingAction, deletePricingAction, updatePricingAction } from './actions'

export const revalidate = 0

export default async function PricingPage() {
  const [admin, rows] = await Promise.all([requireAdmin(), getPricingRows()])
  const canEdit = admin.role !== 'viewer'

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" sx={{ fontSize: 24 }}>
          Preços por modelo
        </Typography>
        <Typography color="text.secondary">
          US$ por 1 milhão de tokens — usado pra estimar custo em Visão geral, Uso e Usuários. Casa
          com o <code>model_id</code> exato salvo em <code>chats.model</code> pelo app Abapfy.
        </Typography>
      </Stack>

      <Card sx={{ p: 2.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Provedor</TableCell>
              <TableCell>Modelo</TableCell>
              <TableCell>model_id</TableCell>
              <TableCell align="right">US$ / 1M entrada</TableCell>
              <TableCell align="right">US$ / 1M saída</TableCell>
              <TableCell>Atualizado</TableCell>
              {canEdit && <TableCell align="right" />}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.model_id} hover>
                <TableCell sx={{ textTransform: 'capitalize' }}>{row.provider}</TableCell>
                <TableCell>{row.label}</TableCell>
                <TableCell>
                  <code style={{ fontSize: 12 }}>{row.model_id}</code>
                </TableCell>
                {canEdit ? (
                  <>
                    <TableCell colSpan={2} sx={{ p: 0 }}>
                      <form
                        action={updatePricingAction}
                        style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', padding: '4px 16px' }}
                      >
                        <input type="hidden" name="model_id" value={row.model_id} />
                        <TextField
                          name="input_price"
                          type="number"
                          size="small"
                          defaultValue={row.input_price_per_million}
                          inputProps={{ step: '0.01', min: '0', style: { width: 74, textAlign: 'right' } }}
                        />
                        <TextField
                          name="output_price"
                          type="number"
                          size="small"
                          defaultValue={row.output_price_per_million}
                          inputProps={{ step: '0.01', min: '0', style: { width: 74, textAlign: 'right' } }}
                        />
                        <IconButton type="submit" size="small" color="primary" title="Salvar">
                          <SaveOutlinedIcon fontSize="small" />
                        </IconButton>
                      </form>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell align="right">{row.input_price_per_million.toFixed(2)}</TableCell>
                    <TableCell align="right">{row.output_price_per_million.toFixed(2)}</TableCell>
                  </>
                )}
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(row.updated_at)}
                  </Typography>
                </TableCell>
                {canEdit && (
                  <TableCell align="right">
                    <form action={deletePricingAction}>
                      <input type="hidden" name="model_id" value={row.model_id} />
                      <IconButton type="submit" size="small" color="error" title="Remover">
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </form>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {canEdit && (
        <Card sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 600, mb: 2 }}>Adicionar modelo</Typography>
          <form action={addPricingAction}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-end' }}>
              <TextField name="provider" label="Provedor" select size="small" defaultValue="claude" sx={{ width: 140 }}>
                <MenuItem value="claude">Claude</MenuItem>
                <MenuItem value="openai">OpenAI</MenuItem>
                <MenuItem value="gemini">Gemini</MenuItem>
              </TextField>
              <TextField name="model_id" label="model_id exato" size="small" required sx={{ minWidth: 220 }} />
              <TextField name="label" label="Nome de exibição" size="small" sx={{ minWidth: 180 }} />
              <TextField
                name="input_price"
                label="US$/1M entrada"
                type="number"
                size="small"
                inputProps={{ step: '0.01', min: '0' }}
                sx={{ width: 140 }}
              />
              <TextField
                name="output_price"
                label="US$/1M saída"
                type="number"
                size="small"
                inputProps={{ step: '0.01', min: '0' }}
                sx={{ width: 140 }}
              />
              <IconButton type="submit" color="primary" title="Adicionar">
                <AddOutlinedIcon />
              </IconButton>
            </Stack>
          </form>
        </Card>
      )}
    </Stack>
  )
}
