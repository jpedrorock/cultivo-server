export function getStatusColor(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-500/10 text-green-600 border-green-500/30";
    case "HARVESTED":
      return "bg-blue-500/10 text-blue-600 border-blue-500/30";
    case "DEAD":
      return "bg-red-500/10 text-red-600 border-red-500/30";
    case "DISCARDED":
      return "bg-orange-500/10 text-orange-600 border-orange-500/30";
    default:
      return "bg-gray-500/10 text-gray-600 border-gray-500/30";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Ativa";
    case "HARVESTED":
      return "Colhida";
    case "DEAD":
      return "Morta";
    case "DISCARDED":
      return "Descartada";
    default:
      return status;
  }
}
