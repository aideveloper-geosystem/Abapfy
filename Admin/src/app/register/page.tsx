'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import { AuthShell } from '@/components/AuthShell'
import { registerAction, type AuthFormState } from './actions'

const initialState: AuthFormState = { error: null }

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, initialState)

  return (
    <AuthShell
      title="Registrar administrador"
      subtitle="Primeiro cadastro vira o administrador principal (owner). Depois disso, todo novo cadastro precisa de convite."
      footer={
        <>
          Já tem conta?{' '}
          <Link href="/login" style={{ color: 'inherit', fontWeight: 600 }}>
            Entrar
          </Link>
        </>
      }
    >
      <form action={formAction}>
        <TextField name="name" label="Nome" fullWidth required autoFocus margin="normal" size="small" />
        <TextField
          name="email"
          type="email"
          label="E-mail"
          fullWidth
          required
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
          helperText="Mínimo 8 caracteres."
        />
        <TextField
          name="confirmPassword"
          type="password"
          label="Confirmar senha"
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
          {pending ? 'Registrando…' : 'Registrar'}
        </Button>
      </form>
    </AuthShell>
  )
}
