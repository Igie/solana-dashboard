import { ExternalLink, Copy, Info, Users, MessageCircle } from "lucide-react";
import { toast } from "sonner";

const AboutPage: React.FC = () => {
  const wallet = "CDsSZvpGNYmmMVhjMTsqtS4j9iFfu9G9R8sJLRT4zZfx";
  const token = "83YPDRtSkNv79ctSn2iWcs5JeD86YNi3UZYxVxubbREV";
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.message("Copied!");
    } catch (err) {
      toast.error("Failed to copy!");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] lg:h-[calc(100vh-75px)] items-center justify-center space-y-2">
      <div className="w-full h-full overflow-y-auto rounded-xs bg-gray-900 text-white p-1">
        <h1 className="flex items-center justify-center gap-2 text-2xl font-bold mb-4">
          <Info className="text-purple-400" /> About This Tool
        </h1>

        <p className="text-gray-300 mb-4">
          This dApp tool was created to help manage{" "}
          <span className="font-semibold">Meteora DAMM v2</span> positions and
          to find/create pools easier.
        </p>
        <p>
          It uses the <span className="font-semibold">Helius Pro plan</span> for
          reliable on-chain data, with future plans to upgrade for higher rate
          limits, more credits, and richer data support.
        </p>
        <p>
          Please note: I am{" "}
          <span className="font-semibold text-red-400">
            not responsible for any capital you choose to use
          </span>{" "}
          when interacting with this tool.
        </p>

        <p className="text-gray-300 mb-4">
          Wallet integration is being worked on with providers, so for now you
          might see warnings when signing transactions.
        </p>
        <div className="space-y-2 mb-6">
          <p className="text-gray-300">You can check out some helpful links:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <a
                href="https://github.com/MeteoraAg/damm-v2-sdk/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline flex items-center gap-1"
              >
                DAMMv2 SDK<ExternalLink size={14} />
              </a>
            </li>
            <li>
              <a
                href="https://github.com/Igie/solana-dashboard/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline flex items-center gap-1"
              >
                DAMMv2 Dashboard source code <ExternalLink size={14} />
              </a>
            </li>
            <li>
              <a
                href="https://meteora.ag"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline flex items-center gap-1"
              >
                Meteora AG <ExternalLink size={14} />
              </a>
            </li>
            <li>
              <a
                href="https://discord.gg/meteora"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline flex items-center gap-1"
              >
                Meteora Discord <ExternalLink size={14} />
              </a>
            </li>
            <li>
              <a
                href="https://discord.gg/lparmy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline flex items-center gap-1"
              >
                LP Army Discord <ExternalLink size={14} />
              </a>
              <p className="text-sm text-gray-400 ml-6">
                I can often be found in the{" "}
                <a
                  href="https://discord.com/channels/1297938165478195220/1371208572930887770"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:underline"
                >
                  #degen-damm
                </a>{" "}
                channel.
              </p>
            </li>
          </ul>
        </div>
        <div className="pt-4 border-t border-gray-700 mb-6 flex flex-col space-y-2">
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-gray-300">
            <span>I am open to suggestions — you can message me on Discord at</span>
            <a
              href="https://discord.com/users/195974879617613824"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-purple-400 hover:underline"
            >
              <MessageCircle size={16} /> Fel'Unh Ikk
            </a>
            <span> or drop into the</span>
            <a
              href="https://discord.com/channels/1297938165478195220/1371208572930887770"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:underline"
            >
              #degen-damm
            </a>
            <span>channel.</span>
          </div>
          <div className="grid items-center gap-2 text-gray-300">
            <span>If you’d like to support my work, you can send SOL or tokens to this wallet:</span>
            <div className="flex items-center gap-2 bg-gray-800 p-2 rounded-md font-mono text-sm text-purple-300">
              <span className="break-all">{wallet}</span>
              <button
                onClick={async () => await copyToClipboard(wallet)}
                className="p-1 rounded hover:bg-gray-700"
                title="Copy to clipboard"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
          <div className="grid items-center gap-2 text-gray-300">
            <span>If you want to support me indirectly, here is a token I made:</span>
            <div className="flex items-center gap-2 bg-gray-800 p-2 rounded-md font-mono text-sm text-purple-300">
              <span className="break-all">83YPDRtSkNv79ctSn2iWcs5JeD86YNi3UZYxVxubbREV</span>
              <button
                onClick={async () => await copyToClipboard(token)}
                className="p-1 rounded hover:bg-gray-700"
                title="Copy to clipboard"
              >
                <Copy size={16} />
              </button>
              <a
                href={`https://gmgn.ai/sol/token/NQhHUcmQ_${token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center p-1 gap-2 rounded hover:bg-gray-700"
                title="GMGN"
              >
                GMGN <ExternalLink size={16} />
              </a>
            </div>
          </div>
        </div>
        <div className="pt-4 border-t border-gray-700">
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-2">
            <Users className="text-purple-400" /> Special Thanks
          </h2>
          <p className="text-gray-300">
            I’d like to thank the developers and community members who helped me
            with guidance, code snippets, and testing. Especially the{" "}
            <span className="font-semibold">#degen-damm</span> channel members
            for giving me courage. This project wouldn’t have been possible
            without their support.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AboutPage;