import { Children, cloneElement, isValidElement, useId, useState } from 'react'

export default function ValidatedField({ children, ...props }) {
  const [error, setError] = useState('')
  const id = useId()
  const title = Children.toArray(children).filter(child => typeof child === 'string').join(' ')
  const fields = Children.map(children, child => isValidElement(child) && ['input', 'textarea', 'select'].includes(child.type) ? cloneElement(child, { 'aria-label': child.props['aria-label'] || title || undefined, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? id : child.props['aria-describedby'] }) : child)
  return <label {...props} onInvalidCapture={event => { event.preventDefault(); setError(event.target.validationMessage) }} onInput={event => { event.target.setCustomValidity?.(''); setError('') }}>{fields}{error && <span className="bs-field-error" id={id} role="alert">{error}</span>}</label>
}
