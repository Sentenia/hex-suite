import { CalendarClock, Coins, Wallet } from "lucide-react";

const MENU_ITEMS = [
  {
    key: "portfolio",
    label: "Portfolio",
    icon: Wallet,
    href: "?page=portfolio"
  },
  {
    key: "stakes",
    label: "HEX Stakes",
    icon: CalendarClock,
    href: "?page=stakes"
  },
  {
    key: "hexStake",
    label: "Create HEX Stake",
    icon: Coins,
    href: "?page=hex-stake"
  }
];

export default function FeatureMenu({ active = "portfolio", onNavigate }) {
  function goTo(item) {
    if (item.disabled) return;

    // Client-side switch when the host handles it; hard navigation only as fallback.
    if (onNavigate) {
      onNavigate(item.key);
      return;
    }

    window.location.href = `${window.location.pathname}${item.href}`;
  }

  return (
    <nav className="featureMenu" aria-label="Portfolio tools">
      {MENU_ITEMS.map((item) => {
        const Icon = item.icon;
        const selected = item.key === active;

        return (
          <button
            key={item.key}
            className={selected ? "featureMenuItem isActive" : "featureMenuItem"}
            type="button"
            disabled={item.disabled}
            onClick={() => goTo(item)}
          >
            <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
