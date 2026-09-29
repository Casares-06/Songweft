"""Aplicación local para explorar el historial ampliado de Spotify."""

from __future__ import annotations

import html
import json
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from analytics import (
    daily_table,
    discovery_table,
    percentage_true,
    session_table,
    streak_stats,
    top_table,
)


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = PROJECT_DIR / "data" / "processed" / "spotify_history.parquet"
QUALITY_PATH = PROJECT_DIR / "data" / "processed" / "quality_report.json"

GREEN = "#1ED760"
LIME = "#B7F34A"
PURPLE = "#8B5CF6"
PINK = "#F472B6"
BLUE = "#38BDF8"
TEXT = "#F7F7F7"
PLOT_COLORS = [GREEN, PURPLE, BLUE, PINK, LIME, "#FB923C"]


st.set_page_config(
    page_title="Songweft — Spotify Stats",
    page_icon="🎧",
    layout="wide",
    initial_sidebar_state="expanded",
)


@st.cache_data
def load_data(path: Path) -> pd.DataFrame:
    return pd.read_parquet(path)


@st.cache_data
def load_quality(path: Path) -> dict[str, object]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def inject_css() -> None:
    st.markdown(
        """
        <style>
        :root { --green: #1ED760; --panel: #181818; --muted: #A7A7A7; }
        .stApp {
            background:
                radial-gradient(circle at 88% 4%, rgba(30,215,96,.11), transparent 25rem),
                radial-gradient(circle at 10% 55%, rgba(139,92,246,.08), transparent 28rem),
                #0A0A0A;
            color: #F7F7F7;
        }
        .block-container { max-width: 1480px; padding-top: 2rem; padding-bottom: 4rem; }
        [data-testid="stSidebar"] { background: rgba(15,15,15,.96); border-right: 1px solid #262626; }
        [data-testid="stMetric"] {
            background: linear-gradient(145deg, rgba(32,32,32,.95), rgba(20,20,20,.95));
            border: 1px solid #2A2A2A; border-radius: 18px; padding: 16px 18px;
            box-shadow: 0 14px 35px rgba(0,0,0,.18);
        }
        [data-testid="stMetricLabel"] { color: #A7A7A7; }
        [data-testid="stMetricValue"] { color: #FFFFFF; letter-spacing: -.04em; }
        .hero {
            position: relative; overflow: hidden; padding: 34px 38px; border-radius: 28px;
            background: linear-gradient(125deg, #1ED760 0%, #12823D 38%, #19142F 100%);
            box-shadow: 0 28px 70px rgba(0,0,0,.35); margin-bottom: 24px;
        }
        .hero:after {
            content: "♫"; position: absolute; right: 36px; top: -40px;
            font-size: 210px; font-weight: 800; color: rgba(255,255,255,.10);
            transform: rotate(10deg);
        }
        .hero-kicker { text-transform: uppercase; letter-spacing: .18em; font-size: 12px; font-weight: 800; opacity: .82; }
        .hero-title { font-size: clamp(38px, 6vw, 78px); line-height: .95; font-weight: 900; letter-spacing: -.06em; margin: 12px 0; }
        .hero-subtitle { max-width: 760px; font-size: 18px; opacity: .9; margin: 0; }
        .hero-badges { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 24px; }
        .hero-badge { background: rgba(0,0,0,.24); border: 1px solid rgba(255,255,255,.17); padding: 8px 13px; border-radius: 999px; font-size: 13px; }
        .section-label { color: var(--green); text-transform: uppercase; letter-spacing: .16em; font-size: 12px; font-weight: 800; margin-bottom: 2px; }
        .record-card { background: #151515; border: 1px solid #292929; border-radius: 18px; padding: 18px; min-height: 120px; }
        .record-label { color: #A7A7A7; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
        .record-value { color: white; font-size: 21px; font-weight: 750; margin-top: 8px; line-height: 1.1; }
        .record-note { color: #8C8C8C; font-size: 12px; margin-top: 8px; }
        div[data-testid="stDataFrame"] { border: 1px solid #292929; border-radius: 16px; overflow: hidden; }
        h1, h2, h3 { letter-spacing: -.035em; }
        a { color: var(--green); }
        </style>
        """,
        unsafe_allow_html=True,
    )


def theme_figure(figure: go.Figure, height: int = 430) -> go.Figure:
    figure.update_layout(
        template="plotly_dark",
        height=height,
        margin=dict(l=12, r=12, t=42, b=12),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color=TEXT),
        hoverlabel=dict(bgcolor="#202020"),
    )
    figure.update_xaxes(gridcolor="rgba(255,255,255,.07)")
    figure.update_yaxes(gridcolor="rgba(255,255,255,.07)")
    return figure


def metric_number(value: float, decimals: int = 0) -> str:
    return f"{value:,.{decimals}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def record_card(label: str, value: str, note: str = "") -> None:
    st.markdown(
        f"""<div class="record-card"><div class="record-label">{html.escape(label)}</div>
        <div class="record-value">{html.escape(value)}</div>
        <div class="record-note">{html.escape(note)}</div></div>""",
        unsafe_allow_html=True,
    )


def render_hero(frame: pd.DataFrame) -> None:
    music = frame.loc[frame["content_type"].eq("track")]
    artists = top_table(music, ["creator_name"])
    tracks = top_table(music, ["item_name", "creator_name"])
    top_artist = "Sin datos" if artists.empty else str(artists.iloc[0]["creator_name"])
    top_track = "Sin datos" if tracks.empty else str(tracks.iloc[0]["item_name"])
    start = frame["played_at_local"].min().strftime("%d/%m/%Y")
    end = frame["played_at_local"].max().strftime("%d/%m/%Y")
    st.markdown(
        f"""
        <div class="hero">
            <div class="hero-kicker">Tu archivo musical · privado y local</div>
            <div class="hero-title">SONGWEFT</div>
            <p class="hero-subtitle">Tu forma de escuchar, convertida en una historia de tiempo, artistas, canciones y hábitos.</p>
            <div class="hero-badges">
                <span class="hero-badge">{metric_number(frame['minutes_played'].sum())} minutos</span>
                <span class="hero-badge">#1 {html.escape(top_artist)}</span>
                <span class="hero-badge">Tema líder: {html.escape(top_track)}</span>
                <span class="hero-badge">{start} — {end}</span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_kpis(frame: pd.DataFrame) -> None:
    active_days = frame["played_day"].nunique()
    columns = st.columns(6)
    columns[0].metric("Minutos", metric_number(frame["minutes_played"].sum()))
    columns[1].metric("Horas", metric_number(frame["hours_played"].sum(), 1))
    columns[2].metric("Reproducciones ≥30 s", metric_number(frame["played_30_seconds"].sum()))
    columns[3].metric("Artistas", metric_number(frame["creator_name"].nunique()))
    columns[4].metric("Canciones", metric_number(frame.loc[frame.content_type.eq('track'), "item_uri"].nunique()))
    average = frame["minutes_played"].sum() / active_days if active_days else 0
    columns[5].metric("Media por día activo", f"{metric_number(average, 1)} min")


def overview_page(frame: pd.DataFrame, ranking_size: int) -> None:
    render_hero(frame)
    render_kpis(frame)

    music = frame.loc[frame["content_type"].eq("track")]
    daily = daily_table(frame)
    streak = streak_stats(frame)
    top_artists = top_table(music, ["creator_name"])
    top_tracks = top_table(music, ["item_name", "creator_name"])
    busiest = daily.sort_values("minutos", ascending=False).iloc[0]
    artist_value = "—" if top_artists.empty else str(top_artists.iloc[0]["creator_name"])
    artist_note = "Sin música en el filtro" if top_artists.empty else f"{metric_number(top_artists.iloc[0]['minutos'], 1)} minutos"
    track_value = "—" if top_tracks.empty else str(top_tracks.iloc[0]["item_name"])
    track_note = "Sin música en el filtro" if top_tracks.empty else str(top_tracks.iloc[0]["creator_name"])

    st.markdown("<div class='section-label'>Récords personales</div>", unsafe_allow_html=True)
    st.subheader("Lo más destacado")
    cards = st.columns(4)
    with cards[0]:
        record_card(
            "Día con más escucha",
            pd.Timestamp(busiest["played_day"]).strftime("%d/%m/%Y"),
            f"{metric_number(busiest['minutos'], 1)} minutos",
        )
    with cards[1]:
        record_card(
            "Racha más larga",
            f"{streak['longest']} días",
            f"{pd.Timestamp(streak['start']).strftime('%d/%m/%Y')} — {pd.Timestamp(streak['end']).strftime('%d/%m/%Y')}",
        )
    with cards[2]:
        record_card(
            "Artista principal",
            artist_value,
            artist_note,
        )
    with cards[3]:
        record_card(
            "Canción principal",
            track_value,
            track_note,
        )

    st.markdown("<div class='section-label'>Evolución</div>", unsafe_allow_html=True)
    st.subheader("Tu escucha a lo largo del tiempo")
    monthly = frame.groupby("played_month", as_index=False).agg(minutos=("minutes_played", "sum"))
    figure = px.area(
        monthly,
        x="played_month",
        y="minutos",
        labels={"played_month": "Mes", "minutos": "Minutos"},
        color_discrete_sequence=[GREEN],
    )
    figure.update_traces(line=dict(width=2), fillcolor="rgba(30,215,96,.16)")
    st.plotly_chart(theme_figure(figure), width="stretch")

    left, right = st.columns(2)
    with left:
        st.subheader(f"Top {ranking_size} artistas")
        if top_artists.empty:
            st.info("No hay música en el filtro actual.")
        else:
            chart = top_artists.head(ranking_size).sort_values("minutos")
            figure = px.bar(
                chart, x="minutos", y="creator_name", orientation="h",
                labels={"creator_name": "Artista", "minutos": "Minutos"},
                color_discrete_sequence=[GREEN],
            )
            st.plotly_chart(theme_figure(figure, 560), width="stretch")
    with right:
        st.subheader(f"Top {ranking_size} canciones")
        if top_tracks.empty:
            st.info("No hay música en el filtro actual.")
        else:
            chart = top_tracks.head(ranking_size).copy()
            chart["etiqueta"] = chart["item_name"] + " — " + chart["creator_name"]
            chart = chart.sort_values("minutos")
            figure = px.bar(
                chart, x="minutos", y="etiqueta", orientation="h",
                labels={"etiqueta": "Canción", "minutos": "Minutos"},
                color_discrete_sequence=[PURPLE],
            )
            st.plotly_chart(theme_figure(figure, 560), width="stretch")


def rankings_page(frame: pd.DataFrame, ranking_size: int) -> None:
    st.markdown("<div class='section-label'>Clasificaciones completas</div>", unsafe_allow_html=True)
    st.title("Rankings")
    music = frame.loc[frame["content_type"].eq("track")]
    if music.empty:
        st.info("No hay canciones con el filtro actual. Selecciona Todo el audio o Solo música.")
        return
    ranking_type = st.segmented_control(
        "Entidad", ["Artistas", "Canciones", "Álbumes"], default="Artistas"
    )
    measure = st.segmented_control(
        "Ordenar por",
        ["Minutos", "Reproducciones ≥30 s", "Eventos"],
        default="Minutos",
    )
    sort_column = {
        "Minutos": "minutos",
        "Reproducciones ≥30 s": "reproducciones_30s",
        "Eventos": "eventos",
    }[measure]
    dimensions = {
        "Artistas": ["creator_name"],
        "Canciones": ["item_name", "creator_name"],
        "Álbumes": ["collection_name", "creator_name"],
    }[ranking_type]
    ranking = top_table(music, dimensions, sort_by=sort_column)

    search = st.text_input(
        "Buscar",
        placeholder="Busca cualquier artista, canción o álbum y conserva su posición real",
    ).strip()
    shown = ranking
    if search:
        mask = pd.Series(False, index=ranking.index)
        for column in dimensions:
            mask |= ranking[column].astype(str).str.contains(
                search, case=False, regex=False, na=False
            )
        shown = ranking.loc[mask]
    else:
        shown = ranking.head(ranking_size)

    display = shown.copy()
    display["minutos"] = display["minutos"].round(1)
    display["horas"] = display["horas"].round(1)
    display["primera_escucha"] = display["primera_escucha"].dt.strftime("%d/%m/%Y")
    display["última_escucha"] = display["última_escucha"].dt.strftime("%d/%m/%Y")
    st.dataframe(display, width="stretch", hide_index=True)
    st.download_button(
        "Descargar ranking completo",
        ranking.to_csv(index=False).encode("utf-8-sig"),
        file_name=f"ranking_{ranking_type.lower()}.csv",
        mime="text/csv",
    )

    total_minutes = music["minutes_played"].sum()
    top_ten_share = ranking.head(10)["minutos"].sum() / total_minutes * 100 if total_minutes else 0
    st.caption(f"Los 10 primeros concentran el {top_ten_share:.1f}% de tus minutos musicales.")


def history_page(frame: pd.DataFrame) -> None:
    st.markdown("<div class='section-label'>Calendario musical</div>", unsafe_allow_html=True)
    st.title("Historia y comparativas")
    granularity = st.segmented_control(
        "Agrupar por", ["Día", "Mes", "Año"], default="Mes"
    )
    time_column = {"Día": "played_day", "Mes": "played_month", "Año": "year"}[granularity]
    timeline = frame.groupby(time_column, as_index=False).agg(
        minutos=("minutes_played", "sum"),
        reproducciones=("played_30_seconds", "sum"),
        artistas=("creator_name", "nunique"),
    )
    metric = st.selectbox("Métrica", ["minutos", "reproducciones", "artistas"])
    figure = px.line(
        timeline, x=time_column, y=metric, markers=granularity == "Año",
        color_discrete_sequence=[GREEN],
        labels={time_column: granularity, metric: metric.capitalize()},
    )
    st.plotly_chart(theme_figure(figure, 500), width="stretch")

    yearly = frame.groupby("year", as_index=False).agg(
        minutos=("minutes_played", "sum"),
        reproducciones=("played_30_seconds", "sum"),
        artistas=("creator_name", "nunique"),
        canciones=("item_uri", "nunique"),
    )
    st.subheader("Resumen anual")
    st.dataframe(yearly.round(1), width="stretch", hide_index=True)

    years = sorted(int(year) for year in frame["year"].dropna().unique())
    if len(years) >= 2:
        st.subheader("Comparar años")
        col1, col2 = st.columns(2)
        year_a = col1.selectbox("Primer año", years, index=max(0, len(years) - 2))
        year_b = col2.selectbox("Segundo año", years, index=len(years) - 1)
        compare = yearly.loc[yearly["year"].isin([year_a, year_b])].melt(
            id_vars="year", value_vars=["minutos", "reproducciones", "artistas", "canciones"],
            var_name="métrica", value_name="valor",
        )
        figure = px.bar(
            compare, x="métrica", y="valor", color="year", barmode="group",
            color_discrete_sequence=[GREEN, PURPLE],
        )
        st.plotly_chart(theme_figure(figure), width="stretch")


def habits_page(frame: pd.DataFrame) -> None:
    st.markdown("<div class='section-label'>Tu rutina</div>", unsafe_allow_html=True)
    st.title("Hábitos de escucha")
    heat = frame.groupby(["weekday", "weekday_number", "hour"], as_index=False).agg(
        minutos=("minutes_played", "sum")
    )
    order = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    matrix = heat.pivot(index="weekday", columns="hour", values="minutos").reindex(order).fillna(0)
    figure = px.imshow(
        matrix, aspect="auto",
        color_continuous_scale=[[0, "#151515"], [.45, "#14532D"], [1, GREEN]],
        labels={"x": "Hora", "y": "Día", "color": "Minutos"},
    )
    st.plotly_chart(theme_figure(figure, 440), width="stretch")

    behavior = st.columns(4)
    behavior[0].metric("Saltadas", f"{percentage_true(frame, 'skipped'):.1f}%")
    behavior[1].metric("En aleatorio", f"{percentage_true(frame, 'shuffle'):.1f}%")
    behavior[2].metric("Sin conexión", f"{percentage_true(frame, 'offline'):.1f}%")
    behavior[3].metric("Sesión privada", f"{percentage_true(frame, 'incognito_mode'):.1f}%")

    left, right = st.columns(2)
    with left:
        st.subheader("Plataformas")
        platforms = frame.groupby("platform", dropna=False)["minutes_played"].sum().nlargest(12).reset_index()
        figure = px.pie(
            platforms, names="platform", values="minutes_played", hole=.62,
            color_discrete_sequence=PLOT_COLORS,
        )
        st.plotly_chart(theme_figure(figure), width="stretch")
    with right:
        st.subheader("Países")
        countries = frame.groupby("conn_country", dropna=False)["minutes_played"].sum().nlargest(12).reset_index()
        figure = px.bar(
            countries.sort_values("minutes_played"), x="minutes_played", y="conn_country",
            orientation="h", color_discrete_sequence=[BLUE],
            labels={"conn_country": "País", "minutes_played": "Minutos"},
        )
        st.plotly_chart(theme_figure(figure), width="stretch")

    starts = frame["reason_start"].fillna("desconocido").value_counts().head(12).rename_axis("motivo").reset_index(name="eventos")
    ends = frame["reason_end"].fillna("desconocido").value_counts().head(12).rename_axis("motivo").reset_index(name="eventos")
    left, right = st.columns(2)
    with left:
        st.subheader("Cómo comienzan")
        st.dataframe(starts, width="stretch", hide_index=True)
    with right:
        st.subheader("Cómo terminan")
        st.dataframe(ends, width="stretch", hide_index=True)


def sessions_page(frame: pd.DataFrame) -> None:
    st.markdown("<div class='section-label'>Continuidad</div>", unsafe_allow_html=True)
    st.title("Sesiones, días y rachas")
    sessions = session_table(frame)
    daily = daily_table(frame)
    streak = streak_stats(frame)
    metrics = st.columns(5)
    metrics[0].metric("Sesiones", metric_number(len(sessions)))
    metrics[1].metric("Días activos", metric_number(len(daily)))
    metrics[2].metric("Racha máxima", f"{streak['longest']} días")
    metrics[3].metric("Racha hasta último dato", f"{streak['current']} días")
    metrics[4].metric("Minutos/sesión", metric_number(sessions["minutos"].mean(), 1))

    st.subheader("Días más intensos")
    top_days = daily.sort_values("minutos", ascending=False).head(20).copy()
    top_days["fecha"] = top_days["played_day"].dt.strftime("%d/%m/%Y")
    st.dataframe(
        top_days[["fecha", "minutos", "eventos", "reproducciones_30s", "artistas"]].round(1),
        width="stretch", hide_index=True,
    )
    st.subheader("Sesiones más largas por tiempo escuchado")
    shown = sessions.head(25).copy()
    shown["inicio"] = shown["inicio"].dt.strftime("%d/%m/%Y %H:%M")
    shown["fin"] = shown["fin"].dt.strftime("%d/%m/%Y %H:%M")
    st.dataframe(shown.round(1), width="stretch", hide_index=True)
    st.caption("Las sesiones son aproximadas: una pausa superior a 30 minutos inicia otra sesión.")


def discovery_page(frame: pd.DataFrame) -> None:
    st.markdown("<div class='section-label'>Exploración</div>", unsafe_allow_html=True)
    st.title("Descubrimiento y variedad")
    music = frame.loc[frame["content_type"].eq("track")]
    if music.empty:
        st.info("No hay canciones con el filtro actual. Selecciona Todo el audio o Solo música.")
        return
    new_artists = discovery_table(music, "creator_name")
    new_tracks = discovery_table(music, "item_uri")
    combined = new_artists.rename(columns={"nuevos": "Artistas nuevos"}).merge(
        new_tracks.rename(columns={"nuevos": "Canciones nuevas"}), on="mes", how="outer"
    ).fillna(0)
    figure = px.line(
        combined, x="mes", y=["Artistas nuevos", "Canciones nuevas"],
        color_discrete_sequence=[GREEN, PURPLE],
        labels={"value": "Descubrimientos", "variable": "Tipo", "mes": "Mes"},
    )
    st.plotly_chart(theme_figure(figure, 500), width="stretch")

    artist_minutes = music.groupby("creator_name")["minutes_played"].sum().sort_values(ascending=False)
    total = artist_minutes.sum()
    shares = st.columns(4)
    for column, n in zip(shares, [1, 5, 10, 50]):
        share = artist_minutes.head(n).sum() / total * 100 if total else 0
        column.metric(f"Peso del top {n}", f"{share:.1f}%")

    first = top_table(music, ["creator_name"]).sort_values("primera_escucha").head(30)
    first["primera_escucha"] = first["primera_escucha"].dt.strftime("%d/%m/%Y")
    st.subheader("Tus primeros artistas registrados")
    st.dataframe(
        first[["creator_name", "primera_escucha", "minutos", "eventos"]].round(1),
        width="stretch", hide_index=True,
    )


def podcasts_page(frame: pd.DataFrame) -> None:
    st.markdown("<div class='section-label'>Audio hablado</div>", unsafe_allow_html=True)
    st.title("Podcasts")
    podcasts = frame.loc[frame["content_type"].eq("episode")]
    if podcasts.empty:
        st.info("No hay episodios de podcast en el periodo seleccionado.")
        return
    metrics = st.columns(4)
    metrics[0].metric("Minutos", metric_number(podcasts["minutes_played"].sum(), 1))
    metrics[1].metric("Episodios distintos", metric_number(podcasts["item_uri"].nunique()))
    metrics[2].metric("Programas", metric_number(podcasts["creator_name"].nunique()))
    metrics[3].metric("Eventos", metric_number(len(podcasts)))
    shows = top_table(podcasts, ["creator_name"])
    episodes = top_table(podcasts, ["item_name", "creator_name"])
    for table in [shows, episodes]:
        table["minutos"] = table["minutos"].round(1)
        table["horas"] = table["horas"].round(1)
        table["primera_escucha"] = table["primera_escucha"].dt.strftime("%d/%m/%Y")
        table["última_escucha"] = table["última_escucha"].dt.strftime("%d/%m/%Y")
    left, right = st.columns(2)
    with left:
        st.subheader("Programas principales")
        st.dataframe(shows.head(25), width="stretch", hide_index=True)
    with right:
        st.subheader("Episodios principales")
        st.dataframe(episodes.head(25), width="stretch", hide_index=True)


def explorer_page(frame: pd.DataFrame) -> None:
    st.markdown("<div class='section-label'>Detalle</div>", unsafe_allow_html=True)
    st.title("Explorador de reproducciones")
    query = st.text_input("Buscar artista, canción, álbum o podcast").strip()
    explored = frame
    if query:
        mask = pd.Series(False, index=frame.index)
        for column in ["item_name", "creator_name", "collection_name"]:
            mask |= frame[column].astype(str).str.contains(query, case=False, regex=False, na=False)
        explored = frame.loc[mask]
    columns = [
        "played_at_local", "item_name", "creator_name", "collection_name",
        "minutes_played", "skipped", "platform", "conn_country", "content_type",
    ]
    display = explored[columns].sort_values("played_at_local", ascending=False).copy()
    display["played_at_local"] = display["played_at_local"].dt.strftime("%d/%m/%Y %H:%M")
    display["minutes_played"] = display["minutes_played"].round(2)
    st.write(f"**{len(display):,} resultados**")
    st.dataframe(display.head(1000), width="stretch", hide_index=True)
    if len(display) > 1000:
        st.caption("Se muestran 1.000 filas; la descarga incluye todos los resultados.")
    st.download_button(
        "Descargar resultados",
        display.to_csv(index=False).encode("utf-8-sig"),
        file_name="historial_filtrado.csv",
        mime="text/csv",
    )


def quality_page(frame: pd.DataFrame, report: dict[str, object]) -> None:
    st.markdown("<div class='section-label'>Transparencia</div>", unsafe_allow_html=True)
    st.title("Calidad y metodología")
    st.write(
        "La aplicación conserva una copia auditada sin la dirección IP y utiliza otra "
        "copia en la que solo se retiran duplicados completamente idénticos."
    )
    checks = pd.DataFrame(
        {
            "Comprobación": [
                "Registros originales", "Registros utilizados", "Duplicados exactos retirados",
                "Minutos originales", "Minutos utilizados", "Minutos retirados",
                "Fechas inválidas", "Vídeos guardados por separado", "Primera fecha UTC", "Última fecha UTC",
            ],
            "Resultado": [
                report.get("audio_records_raw", "—"), report.get("audio_records_clean", len(frame)),
                report.get("exact_duplicate_extras", "—"), report.get("minutes_raw", "—"),
                report.get("minutes_clean", "—"), report.get("duplicate_minutes_removed", "—"),
                report.get("invalid_dates", "—"), report.get("video_records_separate", "—"),
                report.get("first_play_utc", "—"), report.get("last_play_utc", "—"),
            ],
        }
    )
    checks["Resultado"] = checks["Resultado"].astype(str)
    st.dataframe(checks, width="stretch", hide_index=True)
    st.subheader("Cobertura por archivo")
    coverage = frame.groupby("source_file", as_index=False).agg(
        registros=("item_name", "size"), minutos=("minutes_played", "sum"),
        primera_fecha=("played_at_local", "min"), última_fecha=("played_at_local", "max"),
    )
    coverage["primera_fecha"] = coverage["primera_fecha"].dt.strftime("%d/%m/%Y")
    coverage["última_fecha"] = coverage["última_fecha"].dt.strftime("%d/%m/%Y")
    st.dataframe(coverage.round(1), width="stretch", hide_index=True)
    st.info(
        "Una reproducción de 30 segundos es una regla analítica de este proyecto. "
        "Los minutos se calculan siempre con ms_played, el tiempo real incluido por Spotify."
    )


def main() -> None:
    inject_css()
    if not DATA_PATH.exists():
        st.error("No existe el historial procesado. Ejecuta src/process_data.py.")
        st.stop()

    history = load_data(DATA_PATH)
    report = load_quality(QUALITY_PATH)

    with st.sidebar:
        st.markdown("## 🎧 SONGWEFT")
        st.caption("Tu archivo musical personal")
        page = st.radio(
            "Navegación",
            ["Inicio", "Rankings", "Historia", "Hábitos", "Sesiones y rachas", "Descubrimiento", "Podcasts", "Explorar", "Calidad"],
            label_visibility="collapsed",
        )
        st.divider()
        st.markdown("### Filtros globales")
        min_date = history["played_day"].min().date()
        max_date = history["played_day"].max().date()
        date_range = st.date_input(
            "Periodo", value=(min_date, max_date), min_value=min_date, max_value=max_date
        )
        content_options = {"Todo el audio": "all", "Solo música": "track", "Solo podcasts": "episode"}
        content_label = st.selectbox("Contenido", list(content_options))
        ranking_size = st.slider("Tamaño de rankings", 5, 50, 20, 5)
        only_30s = st.toggle("Solo reproducciones ≥30 s", value=False)
        st.divider()
        st.caption(f"Último dato: {history['played_at_local'].max().strftime('%d/%m/%Y %H:%M')}")
        st.caption("Procesamiento local · Sin subir tu historial")

    if isinstance(date_range, tuple) and len(date_range) == 2:
        start_date, end_date = date_range
    else:
        start_date = end_date = date_range

    filtered = history.loc[
        history["played_day"].dt.date.between(start_date, end_date)
    ].copy()
    selected_content = content_options[content_label]
    if selected_content != "all":
        filtered = filtered.loc[filtered["content_type"].eq(selected_content)]
    if only_30s:
        filtered = filtered.loc[filtered["played_30_seconds"]]
    if filtered.empty:
        st.warning("No hay reproducciones con los filtros seleccionados.")
        st.stop()

    pages = {
        "Inicio": lambda: overview_page(filtered, ranking_size),
        "Rankings": lambda: rankings_page(filtered, ranking_size),
        "Historia": lambda: history_page(filtered),
        "Hábitos": lambda: habits_page(filtered),
        "Sesiones y rachas": lambda: sessions_page(filtered),
        "Descubrimiento": lambda: discovery_page(filtered),
        "Podcasts": lambda: podcasts_page(filtered),
        "Explorar": lambda: explorer_page(filtered),
        "Calidad": lambda: quality_page(filtered, report),
    }
    pages[page]()


if __name__ == "__main__":
    main()
