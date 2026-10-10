# Automatisches Einhängen von Karte und USB (Beelink)

Host-Einrichtung für req-006. Der Beelink (Ubuntu Server ohne Desktop)
hängt eingesteckte Datenträger sonst nicht ein. Diese Dateien sorgen
dafür, dass jede SD-Karte und jeder USB-Datenträger **nur lesend** unter
`/media/knipsa/<Bezeichnung>` erscheint und beim Herausziehen wieder
verschwindet.

| Datei | Ziel auf dem Beelink |
|---|---|
| `knipsa-automount` | `/usr/local/sbin/` |
| `knipsa-automount-aufraeumen` | `/usr/local/sbin/` |
| `99-knipsa-automount.rules` | `/etc/udev/rules.d/` |

## Installieren

Im Repo-Checkout auf dem Beelink:

```sh
cd deploy/host/automount
sudo install -m 755 knipsa-automount knipsa-automount-aufraeumen /usr/local/sbin/
sudo install -m 644 99-knipsa-automount.rules /etc/udev/rules.d/
sudo mkdir -p /media/knipsa
sudo udevadm control --reload-rules
```

## Prüfen

Karte oder Stick einstecken, dann:

```sh
findmnt -R /media/knipsa          # zeigt den Datenträger mit Option "ro"
journalctl -t knipsa-automount -n 5
```

Herausziehen — nach wenigen Sekunden ist er aus `findmnt` verschwunden
und der leere Ordner unter `/media/knipsa` entfernt.

## Entfernen

```sh
sudo rm /etc/udev/rules.d/99-knipsa-automount.rules \
        /usr/local/sbin/knipsa-automount /usr/local/sbin/knipsa-automount-aufraeumen
sudo udevadm control --reload-rules
```
