const pad = (value: number, length = 2): string => String(value).padStart(length, '0')

const toDate = (value: string | number | Date): Date | null => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatDate = (
  value: string | number | Date,
  separator: '/' | '-' = '-'
): string | null => {
  const date = toDate(value)
  if (!date) {
    return null
  }
  return [pad(date.getFullYear(), 4), pad(date.getMonth() + 1), pad(date.getDate())].join(separator)
}

export const monthKey = (value: string | number | Date): string | null => {
  const date = toDate(value)
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}` : null
}

/** 轮次时间：当天只显示时分，同年显示月日，跨年带年份。 */
export const formatRoundTime = (value: string | number | Date): string | null => {
  const date = toDate(value)
  if (!date) {
    return null
  }
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return time
  }
  const monthDay = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return date.getFullYear() === now.getFullYear()
    ? `${monthDay} ${time}`
    : `${date.getFullYear()}-${monthDay} ${time}`
}

/** 完整时间，用于悬停提示。 */
export const formatFullTime = (value: string | number | Date): string | null => {
  const date = toDate(value)
  return date
    ? `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    : null
}
