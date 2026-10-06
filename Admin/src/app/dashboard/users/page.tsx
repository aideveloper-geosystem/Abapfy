import Card from '@mui/material/Card'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getUsersWithUsage } from '@/lib/queries'
import { UsersTable } from '@/components/UsersTable'

export const revalidate = 0

export default async function UsersPage() {
  const users = await getUsersWithUsage()

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" sx={{ fontSize: 24 }}>
          Usuários
        </Typography>
        <Typography color="text.secondary">
          {users.length} usuários cadastrados no Abapfy. Uso e custo referem-se aos últimos 90 dias.
        </Typography>
      </Stack>
      <Card sx={{ p: 2.5 }}>
        <UsersTable users={users} />
      </Card>
    </Stack>
  )
}
