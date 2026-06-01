/** Open Google Maps search for a pharmacy name + address/suburb. */
export function openDirections(pharmacyName, suburbOrAddress) {
  if (!pharmacyName) return
  const query = encodeURIComponent(`${pharmacyName} ${suburbOrAddress || ''}`.trim())
  window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank', 'noopener,noreferrer')
}

export function pharmacyAddressLine(pharmacy) {
  if (!pharmacy) return ''
  return (
    pharmacy.location_address ||
    pharmacy.address ||
    pharmacy.location_suburb ||
    pharmacy.suburb ||
    ''
  )
}
