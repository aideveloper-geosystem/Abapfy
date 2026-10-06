'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import { AuthShell } from '@/components/AuthShell'
import { signInAction, type AuthFormState } from './actions'

const initialState: AuthFormState = { error: null }

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signInAction, initialState)

  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesso restrito a administradores do Abapfy."
      footer={
        <>
          Primeiro acesso?{' '}
          <Link href="/register" style={{ color: 'inherit', fontWeight: 600 }}>
            Registrar como administrador
          </Link>
        </>
      }
    >
      <form action={formAction}>
        <TextField
          name="email"
          type="email"
          label="E-mail"
          fullWidth
          required
          autoFocus
          margin="normal"
          size="small"
        />
        <TextField
          name="password"
          type="password"
          label="Senha"
          fullWidth
          required
          margin="normal"
          size="small"
        />
        {state.error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {state.error}
          </Alert>
        )}
        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={pending}
          sx={{ mt: 3 }}
          startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {pending ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthShell>
  )
}
