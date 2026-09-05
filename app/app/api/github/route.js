// Estado e conexao da conta do GitHub (Device Flow). Roda so local.
import { estado, iniciarDeviceFlow, verificarDeviceFlow, concluirConexao, desconectar } from "../../../lib/github";

export const maxDuration = 60;

export async function GET() {
  try {
    return Response.json(estado());
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { acao, device_code } = await req.json().catch(() => ({}));

    if (acao === "iniciar") {
      return Response.json(await iniciarDeviceFlow());
    }

    if (acao === "verificar") {
      if (!device_code) throw new Error("device_code ausente.");
      const r = await verificarDeviceFlow(device_code);
      if (r.pendente) return Response.json({ pendente: true, intervalo: r.intervalo });
      const info = await concluirConexao(r.token);
      return Response.json({ pendente: false, ...info });
    }

    if (acao === "desconectar") {
      desconectar();
      return Response.json({ conectado: false });
    }

    throw new Error("Ação desconhecida.");
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
